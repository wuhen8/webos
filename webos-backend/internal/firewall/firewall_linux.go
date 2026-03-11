//go:build linux

package firewall

import (
	"bufio"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"strings"
)

const (
	// chainMain is the top-level chain jumped to from INPUT.
	// All webos-managed rules live here (loopback, ESTABLISHED, SSH, user rules…).
	chainMain = "WEBOS_FIREWALL"
	// chainGuard handles per-IP approval for the webos port.
	chainGuard = "WEBOS_GUARD"
)

type linuxFirewall struct {
	hasIP6tables bool
}

func newPlatformFirewall() (Firewall, error) {
	return newLinux()
}

func newLinux() (Firewall, error) {
	if _, err := exec.LookPath("iptables"); err != nil {
		return nil, fmt.Errorf("iptables not found: %w", err)
	}
	_, hasV6 := exec.LookPath("ip6tables")
	return &linuxFirewall{hasIP6tables: hasV6 == nil}, nil
}

// run executes iptables with the given args.
func (f *linuxFirewall) run(args ...string) (string, error) {
	cmd := exec.Command("iptables", args...)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// run6 executes ip6tables with the given args. No-op if ip6tables is unavailable.
func (f *linuxFirewall) run6(args ...string) (string, error) {
	if !f.hasIP6tables {
		return "", nil
	}
	cmd := exec.Command("ip6tables", args...)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// isIPv6 checks if the given IP or CIDR string is an IPv6 address.
func isIPv6(ip string) bool {
	if strings.Contains(ip, "/") {
		host, _, err := net.ParseCIDR(ip)
		if err != nil {
			return false
		}
		return host.To4() == nil
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	return parsed.To4() == nil
}

// runForIP runs the command with iptables or ip6tables depending on the IP version.
func (f *linuxFirewall) runForIP(ip string, args ...string) (string, error) {
	if isIPv6(ip) {
		return f.run6(args...)
	}
	return f.run(args...)
}

// purgeMainJumps removes all jumps from INPUT to WEBOS_FIREWALL.
func (f *linuxFirewall) purgeMainJumps() {
	for {
		if _, err := f.run("-D", "INPUT", "-j", chainMain); err != nil {
			break
		}
	}
	if f.hasIP6tables {
		for {
			if _, err := f.run6("-D", "INPUT", "-j", chainMain); err != nil {
				break
			}
		}
	}
}

// Init sets up full INPUT chain protection. All rules live in custom chains:
//
//	INPUT (policy DROP)
//	  └─ -j WEBOS_FIREWALL
//	        ├─ loopback ACCEPT
//	        ├─ ESTABLISHED,RELATED ACCEPT
//	        ├─ (user/system rules added later via Exec)
//	        └─ -j WEBOS_GUARD  (webos port IP whitelist)
//	              ├─ approved IPs ACCEPT
//	              └─ default DROP (webos port)
func (f *linuxFirewall) Init(port int) error {
	portStr := strconv.Itoa(port)

	// ── Phase 1: clean slate ──
	f.purgeMainJumps()

	// ── Phase 2: WEBOS_GUARD chain (webos port IP whitelist) ──
	f.run("-N", chainGuard)
	f.run("-F", chainGuard)
	f.run("-A", chainGuard, "-p", "tcp", "-s", "127.0.0.1", "--dport", portStr, "-j", "ACCEPT")

	// ── Phase 3: WEBOS_FIREWALL chain (all base rules) ──
	f.run("-N", chainMain)
	f.run("-F", chainMain)
	// Loopback
	f.run("-A", chainMain, "-i", "lo", "-j", "ACCEPT")
	// ESTABLISHED,RELATED — keeps existing SSH sessions alive
	if _, err := f.run("-A", chainMain, "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT"); err != nil {
		// Fallback for older kernels
		if _, err2 := f.run("-A", chainMain, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"); err2 != nil {
			return fmt.Errorf("allow established (v4): %w", err2)
		}
	}
	// Jump to WEBOS_GUARD for webos port traffic (at end of main chain)
	f.run("-A", chainMain, "-p", "tcp", "--dport", portStr, "-j", chainGuard)

	// ── Phase 4: wire INPUT → WEBOS_FIREWALL, then set DROP policy ──
	if _, err := f.run("-I", "INPUT", "1", "-j", chainMain); err != nil {
		return fmt.Errorf("insert main chain jump (v4): %w", err)
	}
	if _, err := f.run("-P", "INPUT", "DROP"); err != nil {
		return fmt.Errorf("set INPUT policy DROP (v4): %w", err)
	}

	// ── IPv6 ──
	if f.hasIP6tables {
		f.run6("-N", chainGuard)
		f.run6("-F", chainGuard)
		f.run6("-A", chainGuard, "-p", "tcp", "-s", "::1", "--dport", portStr, "-j", "ACCEPT")

		f.run6("-N", chainMain)
		f.run6("-F", chainMain)
		f.run6("-A", chainMain, "-i", "lo", "-j", "ACCEPT")
		if _, err := f.run6("-A", chainMain, "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT"); err != nil {
			f.run6("-A", chainMain, "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT")
		}
		f.run6("-A", chainMain, "-p", "tcp", "--dport", portStr, "-j", chainGuard)

		f.run6("-I", "INPUT", "1", "-j", chainMain)
		f.run6("-P", "INPUT", "DROP")
	}

	return nil
}

func (f *linuxFirewall) AllowIP(ip string, port int, comment string) error {
	portStr := strconv.Itoa(port)
	args := []string{"-I", chainGuard, "1", "-p", "tcp", "-s", ip, "--dport", portStr, "-j", "ACCEPT"}
	if comment != "" {
		args = append(args, "-m", "comment", "--comment", comment)
	}
	if _, err := f.runForIP(ip, args...); err != nil {
		return fmt.Errorf("allow IP %s: %w", ip, err)
	}
	return nil
}

func (f *linuxFirewall) BlockIP(ip string, port int) error {
	portStr := strconv.Itoa(port)
	if _, err := f.runForIP(ip, "-I", chainGuard, "1", "-p", "tcp", "-s", ip, "--dport", portStr, "-j", "DROP"); err != nil {
		return fmt.Errorf("block IP %s: %w", ip, err)
	}
	return nil
}

func (f *linuxFirewall) RemoveIP(ip string, port int) error {
	portStr := strconv.Itoa(port)
	for {
		_, err := f.runForIP(ip, "-D", chainGuard, "-p", "tcp", "-s", ip, "--dport", portStr, "-j", "ACCEPT")
		if err != nil {
			break
		}
	}
	return nil
}

func (f *linuxFirewall) ListAllowed(port int) ([]Rule, error) {
	portStr := strconv.Itoa(port)
	var rules []Rule

	for _, v6 := range []bool{false, true} {
		var out string
		var err error
		if v6 {
			out, err = f.run6("-L", chainGuard, "-n", "--line-numbers")
		} else {
			out, err = f.run("-L", chainGuard, "-n", "--line-numbers")
		}
		if err != nil {
			if v6 {
				continue
			}
			return nil, fmt.Errorf("list rules: %w", err)
		}

		scanner := bufio.NewScanner(strings.NewReader(out))
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.Contains(line, "ACCEPT") || !strings.Contains(line, "dpt:"+portStr) {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) < 5 {
				continue
			}
			ip := fields[4]
			comment := ""
			if idx := strings.Index(line, "/* "); idx >= 0 {
				end := strings.Index(line[idx:], " */")
				if end > 0 {
					comment = line[idx+3 : idx+end]
				}
			}
			rules = append(rules, Rule{
				IP:       ip,
				Port:     port,
				Protocol: "tcp",
				Action:   "ACCEPT",
				Comment:  comment,
			})
		}
	}
	return rules, nil
}

func (f *linuxFirewall) EnableLogNewConn(port int) error {
	portStr := strconv.Itoa(port)

	_, err := f.run("-I", chainGuard, "-p", "tcp", "--dport", portStr,
		"-m", "conntrack", "--ctstate", "NEW",
		"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
	if err != nil {
		_, err = f.run("-I", chainGuard, "-p", "tcp", "--dport", portStr,
			"-m", "state", "--state", "NEW",
			"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
	}

	if f.hasIP6tables {
		_, err6 := f.run6("-I", chainGuard, "-p", "tcp", "--dport", portStr,
			"-m", "conntrack", "--ctstate", "NEW",
			"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
		if err6 != nil {
			f.run6("-I", chainGuard, "-p", "tcp", "--dport", portStr,
				"-m", "state", "--state", "NEW",
				"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
		}
	}

	return err
}

func (f *linuxFirewall) DisableLogNewConn(port int) error {
	portStr := strconv.Itoa(port)

	f.run("-D", chainGuard, "-p", "tcp", "--dport", portStr,
		"-m", "conntrack", "--ctstate", "NEW",
		"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
	f.run("-D", chainGuard, "-p", "tcp", "--dport", portStr,
		"-m", "state", "--state", "NEW",
		"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")

	if f.hasIP6tables {
		f.run6("-D", chainGuard, "-p", "tcp", "--dport", portStr,
			"-m", "conntrack", "--ctstate", "NEW",
			"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
		f.run6("-D", chainGuard, "-p", "tcp", "--dport", portStr,
			"-m", "state", "--state", "NEW",
			"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
	}

	return nil
}

// Cleanup restores INPUT policy to ACCEPT and removes both custom chains.
func (f *linuxFirewall) Cleanup(port int) error {
	f.run("-P", "INPUT", "ACCEPT")
	f.purgeMainJumps()

	// Flush and delete chains (guard first since main references it)
	f.run("-F", chainMain)
	f.run("-X", chainMain)
	f.run("-F", chainGuard)
	f.run("-X", chainGuard)

	if f.hasIP6tables {
		f.run6("-P", "INPUT", "ACCEPT")
		f.run6("-F", chainMain)
		f.run6("-X", chainMain)
		f.run6("-F", chainGuard)
		f.run6("-X", chainGuard)
	}

	return nil
}

func (f *linuxFirewall) Exec(args ...string) error {
	useV6 := false
	for i, a := range args {
		if (a == "-s" || a == "-d") && i+1 < len(args) {
			if isIPv6(args[i+1]) {
				useV6 = true
				break
			}
		}
	}
	if useV6 {
		_, err := f.run6(args...)
		return err
	}
	_, err := f.run(args...)
	return err
}
