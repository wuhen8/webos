package service

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"webos-backend/internal/config"
	"webos-backend/internal/database"
	"webos-backend/internal/firewall"
)

const (
	ipDBV4FileName = "ip2region_v4.xdb"
	ipDBV6FileName = "ip2region_v6.xdb"
	ipDBRemoteDir  = "assets"
)

// IPGuardService manages the IP approval workflow.
type IPGuardService struct {
	fw      firewall.Firewall
	watcher firewall.LogWatcher
	port    int
	enabled bool

	// Callback for sending notifications (set by handler layer)
	OnNewIP func(id int64, ip, location string)

	stopCh chan struct{}
}

var (
	ipGuardOnce sync.Once
	ipGuardInst *IPGuardService
)

// GetIPGuardService returns the singleton IPGuardService.
func GetIPGuardService() *IPGuardService {
	ipGuardOnce.Do(func() {
		ipGuardInst = &IPGuardService{
			stopCh: make(chan struct{}),
			port:   config.Port(),
		}
	})
	return ipGuardInst
}

// SetFirewall sets the firewall implementation (called by FirewallService).
func (s *IPGuardService) SetFirewall(fw firewall.Firewall) {
	s.fw = fw
}

// Start initializes the IP guard chain, restores approved IPs, and begins watching.
// The firewall must be set via SetFirewall before calling Start.
func (s *IPGuardService) Start() error {
	if s.enabled {
		return nil
	}
	if s.fw == nil {
		return fmt.Errorf("firewall not initialized")
	}

	// Reset stop channel for this session
	s.stopCh = make(chan struct{})

	// Init firewall chain (default DROP on our port)
	if err := s.fw.Init(s.port); err != nil {
		return fmt.Errorf("firewall init: %w", err)
	}

	// Restore approved IPs from DB
	approved, err := database.IPGuardListApproved()
	if err != nil {
		log.Printf("[ip-guard] warning: failed to load approved IPs: %v", err)
	}
	for _, r := range approved {
		if err := s.fw.AllowIP(r.IP, s.port, r.Location); err != nil {
			log.Printf("[ip-guard] warning: failed to restore rule for %s: %v", r.IP, err)
		}
	}
	log.Printf("[ip-guard] restored %d approved IPs", len(approved))

	// Restore CIDR whitelist from DB
	cidrs, err := database.IPGuardListCIDRs()
	if err != nil {
		log.Printf("[ip-guard] warning: failed to load CIDRs: %v", err)
	}
	for _, c := range cidrs {
		if err := s.fw.AllowIP(c.CIDR, s.port, c.Note); err != nil {
			log.Printf("[ip-guard] warning: failed to restore CIDR %s: %v", c.CIDR, err)
		}
	}
	if len(cidrs) > 0 {
		log.Printf("[ip-guard] restored %d CIDR whitelist entries", len(cidrs))
	}

	// Auto-seed LAN CIDR on first run
	s.seedLANCIDR()

	// Enable LOG rule
	if err := s.fw.EnableLogNewConn(s.port); err != nil {
		log.Printf("[ip-guard] warning: failed to enable log: %v", err)
	}

	// Start log watcher
	s.watcher = firewall.NewLogWatcher()
	ch, err := s.watcher.Start()
	if err != nil {
		log.Printf("[ip-guard] warning: log watcher failed: %v (will use polling fallback)", err)
	} else {
		go s.watchLoop(ch)
	}

	// Start expiry checker
	go s.expiryLoop()

	s.enabled = true
	log.Printf("[ip-guard] started on port %d", s.port)
	return nil
}

// Stop shuts down the IP guard service.
func (s *IPGuardService) Stop() {
	if !s.enabled {
		return
	}
	close(s.stopCh)
	if s.watcher != nil {
		s.watcher.Stop()
		s.watcher = nil
	}
	s.enabled = false
	log.Println("[ip-guard] stopped")
}

// IsEnabled returns whether IP guard is active.
func (s *IPGuardService) IsEnabled() bool {
	return s.enabled
}

// ApproveIP approves an IP and adds firewall rule.
func (s *IPGuardService) ApproveIP(ip string, ttlSeconds int64) error {
	if err := database.IPGuardApprove(ip, ttlSeconds); err != nil {
		return err
	}
	rec, err := database.IPGuardGetByIP(ip)
	if err != nil {
		return err
	}
	return s.fw.AllowIP(ip, s.port, rec.Location)
}

// RejectIP rejects an IP.
func (s *IPGuardService) RejectIP(ip string) error {
	return database.IPGuardReject(ip)
}

// RemoveIP removes an IP from both DB and firewall.
func (s *IPGuardService) RemoveIP(ip string) error {
	if err := database.IPGuardRemove(ip); err != nil {
		return err
	}
	return s.fw.RemoveIP(ip, s.port)
}

// ListIPs returns all IP records.
func (s *IPGuardService) ListIPs() ([]database.IPRecord, error) {
	return database.IPGuardList()
}

// Disable turns off IP guard and cleans up firewall rules.
func (s *IPGuardService) Disable() error {
	s.Stop()
	if s.fw != nil {
		if err := s.fw.Cleanup(s.port); err != nil {
			return err
		}
	}
	return nil
}

// ==================== CIDR Whitelist ====================

// AddCIDR adds a CIDR range to the whitelist and firewall.
func (s *IPGuardService) AddCIDR(cidr, note string) error {
	// Validate CIDR
	_, _, err := net.ParseCIDR(cidr)
	if err != nil {
		return fmt.Errorf("invalid CIDR: %w", err)
	}
	if err := database.IPGuardAddCIDR(cidr, note, false); err != nil {
		return err
	}
	if s.fw != nil {
		return s.fw.AllowIP(cidr, s.port, note)
	}
	return nil
}

// RemoveCIDR removes a CIDR range from the whitelist and firewall.
func (s *IPGuardService) RemoveCIDR(id int64) error {
	// Get the CIDR before deleting
	cidrs, err := database.IPGuardListCIDRs()
	if err != nil {
		return err
	}
	var cidr string
	for _, c := range cidrs {
		if c.ID == id {
			cidr = c.CIDR
			break
		}
	}
	if err := database.IPGuardRemoveCIDR(id); err != nil {
		return err
	}
	if cidr != "" && s.fw != nil {
		s.fw.RemoveIP(cidr, s.port)
	}
	return nil
}

// ListCIDRs returns all whitelisted CIDR ranges.
func (s *IPGuardService) ListCIDRs() ([]database.CIDRRecord, error) {
	return database.IPGuardListCIDRs()
}

// seedLANCIDR detects the first non-loopback network interface and adds its /24 subnet.
func (s *IPGuardService) seedLANCIDR() {
	// Check if any CIDRs already exist (don't re-seed)
	existing, _ := database.IPGuardListCIDRs()
	if len(existing) > 0 {
		return
	}

	ifaces, err := net.Interfaces()
	if err != nil {
		return
	}

	for _, iface := range ifaces {
		// Skip loopback, down interfaces
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}

		// Skip virtual interfaces (docker, veth, bridge, wg, tun, tap)
		name := iface.Name
		if strings.HasPrefix(name, "veth") ||
			strings.HasPrefix(name, "docker") ||
			strings.HasPrefix(name, "br-") ||
			strings.HasPrefix(name, "wg") ||
			strings.HasPrefix(name, "tun") ||
			strings.HasPrefix(name, "tap") ||
			strings.HasPrefix(name, "virbr") {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil || len(addrs) == 0 {
			continue
		}

		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}

			ip := ipNet.IP
			if ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				continue
			}

			// IPv4 private range → add /24
			if v4 := ip.To4(); v4 != nil && isPrivateIP(v4) {
				cidr := fmt.Sprintf("%d.%d.%d.0/24", v4[0], v4[1], v4[2])
				note := fmt.Sprintf("内网 (%s)", iface.Name)
				if err := database.IPGuardAddCIDR(cidr, note, true); err == nil {
					if s.fw != nil {
						s.fw.AllowIP(cidr, s.port, note)
					}
					log.Printf("[ip-guard] auto-added LAN CIDR: %s (%s)", cidr, iface.Name)
				}
				return // only first physical interface
			}
		}
	}
}

func isPrivateIP(ip net.IP) bool {
	privateRanges := []struct {
		start net.IP
		end   net.IP
	}{
		{net.IP{10, 0, 0, 0}, net.IP{10, 255, 255, 255}},
		{net.IP{172, 16, 0, 0}, net.IP{172, 31, 255, 255}},
		{net.IP{192, 168, 0, 0}, net.IP{192, 168, 255, 255}},
	}
	for _, r := range privateRanges {
		if bytesCompare(ip, r.start) >= 0 && bytesCompare(ip, r.end) <= 0 {
			return true
		}
	}
	return false
}

func bytesCompare(a, b net.IP) int {
	a4 := a.To4()
	b4 := b.To4()
	if a4 == nil || b4 == nil {
		return 0
	}
	for i := 0; i < 4; i++ {
		if a4[i] < b4[i] {
			return -1
		}
		if a4[i] > b4[i] {
			return 1
		}
	}
	return 0
}

func (s *IPGuardService) watchLoop(ch <-chan firewall.LogEvent) {
	for {
		select {
		case <-s.stopCh:
			return
		case evt, ok := <-ch:
			if !ok {
				return
			}
			s.handleNewIP(evt.SrcIP)
		}
	}
}

func (s *IPGuardService) handleNewIP(ip string) {
	// Skip loopback — always allowed at iptables level, LOG just fires first
	parsedIP := net.ParseIP(ip)
	if parsedIP != nil && parsedIP.IsLoopback() {
		return
	}

	// Check if already in DB as approved or rejected
	existing, _ := database.IPGuardGetByIP(ip)
	if existing != nil && (existing.Status == "approved" || existing.Status == "rejected") {
		return
	}

	// Check if IP falls within a whitelisted CIDR — LOG fires before ACCEPT,
	// so whitelisted IPs still trigger the log watcher.
	if parsedIP != nil {
		cidrs, _ := database.IPGuardListCIDRs()
		for _, c := range cidrs {
			_, cidrNet, err := net.ParseCIDR(c.CIDR)
			if err == nil && cidrNet.Contains(parsedIP) {
				return // whitelisted, ignore
			}
		}
	}

	// Lookup location
	location := LookupIPLocation(ip)

	// Upsert as pending
	rec, isNew, err := database.IPGuardUpsertPending(ip, location)
	if err != nil {
		log.Printf("[ip-guard] failed to upsert IP %s: %v", ip, err)
		return
	}

	if isNew {
		log.Printf("[ip-guard] new access attempt: %s (%s)", ip, location)
		if s.OnNewIP != nil {
			s.OnNewIP(rec.ID, rec.IP, rec.Location)
		}
	}
}

func (s *IPGuardService) expiryLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			expired, err := database.IPGuardGetExpired()
			if err != nil {
				continue
			}
			for _, r := range expired {
				log.Printf("[ip-guard] IP %s expired, removing rule", r.IP)
				s.fw.RemoveIP(r.IP, s.port)
				database.IPGuardReject(r.IP)
			}
		}
	}
}

// ==================== IP Location Lookup ====================

// ipDBPath returns the path to an IP database file.
func ipDBPath(filename string) string {
	return filepath.Join(config.DataDir(), filename)
}

// EnsureIPDB downloads both v4 and v6 IP databases if not present.
func EnsureIPDB() {
	downloadIPDB(ipDBV4FileName)
	downloadIPDB(ipDBV6FileName)
}

func downloadIPDB(filename string) {
	path := ipDBPath(filename)
	if _, err := os.Stat(path); err == nil {
		return // already exists
	}

	url := AppStoreBaseURL + "/" + ipDBRemoteDir + "/" + filename
	log.Printf("[ip-guard] downloading %s from %s ...", filename, url)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		log.Printf("[ip-guard] failed to download %s: %v", filename, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("[ip-guard] %s download returned %d", filename, resp.StatusCode)
		return
	}

	tmpPath := path + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		log.Printf("[ip-guard] failed to create temp file: %v", err)
		return
	}

	written, err := io.Copy(f, io.LimitReader(resp.Body, 50<<20))
	f.Close()
	if err != nil {
		os.Remove(tmpPath)
		log.Printf("[ip-guard] failed to write %s: %v", filename, err)
		return
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		log.Printf("[ip-guard] failed to rename %s: %v", filename, err)
		return
	}

	log.Printf("[ip-guard] %s downloaded (%d bytes)", filename, written)
}

// LookupIPLocation looks up the geographic location of an IP address.
// Returns empty string if the database is not available.
func LookupIPLocation(ip string) string {
	return lookupIPLocation(ip)
}
