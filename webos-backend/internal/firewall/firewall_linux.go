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

const chainName = "WEBOS_GUARD"

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
	// Handle CIDR notation
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

// Init creates the WEBOS_GUARD chain in both iptables and ip6tables.
func (f *linuxFirewall) Init(port int) error {
	portStr := strconv.Itoa(port)

	// IPv4
	f.run("-N", chainName)
	f.run("-F", chainName)
	// Always allow loopback so CLI and internal services keep working
	f.run("-A", chainName, "-p", "tcp", "-s", "127.0.0.1", "--dport", portStr, "-j", "ACCEPT")
	if _, err := f.run("-A", chainName, "-p", "tcp", "--dport", portStr, "-j", "DROP"); err != nil {
		return fmt.Errorf("add default DROP (v4): %w", err)
	}
	f.run("-D", "INPUT", "-p", "tcp", "--dport", portStr, "-j", chainName)
	if _, err := f.run("-I", "INPUT", "1", "-p", "tcp", "--dport", portStr, "-j", chainName); err != nil {
		return fmt.Errorf("insert chain jump (v4): %w", err)
	}

	// IPv6
	if f.hasIP6tables {
		f.run6("-N", chainName)
		f.run6("-F", chainName)
		// Always allow loopback
		f.run6("-A", chainName, "-p", "tcp", "-s", "::1", "--dport", portStr, "-j", "ACCEPT")
		if _, err := f.run6("-A", chainName, "-p", "tcp", "--dport", portStr, "-j", "DROP"); err != nil {
			return fmt.Errorf("add default DROP (v6): %w", err)
		}
		f.run6("-D", "INPUT", "-p", "tcp", "--dport", portStr, "-j", chainName)
		if _, err := f.run6("-I", "INPUT", "1", "-p", "tcp", "--dport", portStr, "-j", chainName); err != nil {
			return fmt.Errorf("insert chain jump (v6): %w", err)
		}
	}

	return nil
}

func (f *linuxFirewall) AllowIP(ip string, port int, comment string) error {
	portStr := strconv.Itoa(port)
	args := []string{"-I", chainName, "1", "-p", "tcp", "-s", ip, "--dport", portStr, "-j", "ACCEPT"}
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
	if _, err := f.runForIP(ip, "-I", chainName, "1", "-p", "tcp", "-s", ip, "--dport", portStr, "-j", "DROP"); err != nil {
		return fmt.Errorf("block IP %s: %w", ip, err)
	}
	return nil
}

func (f *linuxFirewall) RemoveIP(ip string, port int) error {
	portStr := strconv.Itoa(port)
	for {
		_, err := f.runForIP(ip, "-D", chainName, "-p", "tcp", "-s", ip, "--dport", portStr, "-j", "ACCEPT")
		if err != nil {
			break
		}
	}
	return nil
}

func (f *linuxFirewall) ListAllowed(port int) ([]Rule, error) {
	portStr := strconv.Itoa(port)
	var rules []Rule

	// Parse from both iptables and ip6tables
	for _, v6 := range []bool{false, true} {
		var out string
		var err error
		if v6 {
			out, err = f.run6("-L", chainName, "-n", "--line-numbers")
		} else {
			out, err = f.run("-L", chainName, "-n", "--line-numbers")
		}
		if err != nil {
			if v6 {
				continue // ip6tables might not be available
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

	// IPv4
	_, err := f.run("-I", chainName, "-p", "tcp", "--dport", portStr,
		"-m", "conntrack", "--ctstate", "NEW",
		"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
	if err != nil {
		_, err = f.run("-I", chainName, "-p", "tcp", "--dport", portStr,
			"-m", "state", "--state", "NEW",
			"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
	}

	// IPv6
	if f.hasIP6tables {
		_, err6 := f.run6("-I", chainName, "-p", "tcp", "--dport", portStr,
			"-m", "conntrack", "--ctstate", "NEW",
			"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
		if err6 != nil {
			f.run6("-I", chainName, "-p", "tcp", "--dport", portStr,
				"-m", "state", "--state", "NEW",
				"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
		}
	}

	return err
}

func (f *linuxFirewall) DisableLogNewConn(port int) error {
	portStr := strconv.Itoa(port)

	// IPv4
	f.run("-D", chainName, "-p", "tcp", "--dport", portStr,
		"-m", "conntrack", "--ctstate", "NEW",
		"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
	f.run("-D", chainName, "-p", "tcp", "--dport", portStr,
		"-m", "state", "--state", "NEW",
		"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")

	// IPv6
	if f.hasIP6tables {
		f.run6("-D", chainName, "-p", "tcp", "--dport", portStr,
			"-m", "conntrack", "--ctstate", "NEW",
			"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
		f.run6("-D", chainName, "-p", "tcp", "--dport", portStr,
			"-m", "state", "--state", "NEW",
			"-j", "LOG", "--log-prefix", "WEBOS_GUARD: ", "--log-level", "4")
	}

	return nil
}

func (f *linuxFirewall) Cleanup(port int) error {
	portStr := strconv.Itoa(port)

	// IPv4
	f.run("-D", "INPUT", "-p", "tcp", "--dport", portStr, "-j", chainName)
	f.run("-F", chainName)
	f.run("-X", chainName)

	// IPv6
	if f.hasIP6tables {
		f.run6("-D", "INPUT", "-p", "tcp", "--dport", portStr, "-j", chainName)
		f.run6("-F", chainName)
		f.run6("-X", chainName)
	}

	return nil
}
