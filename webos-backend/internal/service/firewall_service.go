package service

import (
	"fmt"
	"log"
	"net"
	"strings"
	"sync"

	"webos-backend/internal/config"
	"webos-backend/internal/database"
	"webos-backend/internal/firewall"
)

// FirewallService is the unified firewall manager.
// It owns the iptables lifecycle: enable/disable, rule persistence, and IP guard.
type FirewallService struct {
	mu      sync.Mutex
	fw      firewall.Firewall
	port    int
	enabled bool
	guard   *IPGuardService
}

var (
	fwOnce sync.Once
	fwInst *FirewallService
)

// GetFirewallService returns the singleton FirewallService.
func GetFirewallService() *FirewallService {
	fwOnce.Do(func() {
		fwInst = &FirewallService{
			port: config.Port(),
		}
	})
	return fwInst
}

// InitFirewall reads persisted state and auto-restores if previously enabled.
// Must be called from main() after DB is initialized.
// notifyFn is the callback for IP guard new-IP notifications.
func InitFirewall(notifyFn func(id int64, ip, location string)) {
	svc := GetFirewallService()
	svc.guard = GetIPGuardService()
	svc.guard.OnNewIP = notifyFn

	if database.FWConfigGet("enabled") == "true" {
		go func() {
			if err := svc.Enable(); err != nil {
				log.Printf("[firewall] auto-restore failed: %v", err)
			} else {
				log.Println("[firewall] auto-restored from previous session")
			}
		}()
	}
}

// IsEnabled returns whether the firewall is active.
func (s *FirewallService) IsEnabled() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.enabled
}

// Enable activates the firewall: initializes iptables, restores all persisted rules,
// and starts IP guard (8080 access control).
func (s *FirewallService) Enable() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.enabled {
		return nil
	}

	fw, err := firewall.New()
	if err != nil {
		return fmt.Errorf("init firewall: %w", err)
	}
	s.fw = fw

	// Restore user rules from DB
	if err := s.restoreRules(); err != nil {
		log.Printf("[firewall] warning: failed to restore rules: %v", err)
	}

	// Seed default rules on first enable (SSH + 8080 LAN)
	s.seedDefaultRules()

	s.enabled = true
	database.FWConfigSet("enabled", "true")
	log.Printf("[firewall] enabled on port %d", s.port)

	// Always start IP guard — it's part of the firewall, not a separate feature
	s.guard.SetFirewall(fw)
	go func() {
		if err := s.guard.Start(); err != nil {
			log.Printf("[firewall] ip-guard start failed: %v", err)
		}
	}()

	return nil
}

// Disable turns off the firewall: stops IP guard, cleans up all WebOS-managed rules.
func (s *FirewallService) Disable() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.enabled {
		return nil
	}

	// Stop IP guard and clean up its chain
	s.guard.Stop()
	if s.fw != nil {
		s.fw.Cleanup(s.port)
	}

	// Remove user rules from iptables (best-effort)
	s.cleanupUserRules()

	s.enabled = false
	s.fw = nil
	database.FWConfigSet("enabled", "false")
	log.Println("[firewall] disabled")
	return nil
}

// GetFirewall returns the underlying firewall implementation (for IP guard to use).
func (s *FirewallService) GetFirewall() firewall.Firewall {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.fw
}

// ==================== Rule Management ====================

// AddRule persists a rule to DB and applies it to iptables.
func (s *FirewallService) AddRule(tableName, chain, ruleSpec, comment string, insertFirst bool) (int64, error) {
	var id int64
	var err error
	if insertFirst {
		id, err = database.FWRuleInsertFirst(tableName, chain, ruleSpec, comment, "user")
	} else {
		id, err = database.FWRuleAdd(tableName, chain, ruleSpec, comment, "user")
	}
	if err != nil {
		return 0, fmt.Errorf("save rule: %w", err)
	}

	// Apply to iptables
	if s.fw != nil {
		if err := s.applyRule(tableName, chain, ruleSpec, insertFirst); err != nil {
			// Rollback DB
			database.FWRuleRemove(id)
			return 0, fmt.Errorf("apply rule: %w", err)
		}
	}

	return id, nil
}

// RemoveRule removes a rule from DB and iptables.
func (s *FirewallService) RemoveRule(id int64) error {
	// Get rule before deleting
	rules, err := database.FWRuleListAll("filter")
	if err != nil {
		return err
	}
	natRules, _ := database.FWRuleListAll("nat")
	rules = append(rules, natRules...)

	var rule *database.FirewallRule
	for _, r := range rules {
		if r.ID == id {
			rule = &r
			break
		}
	}

	if err := database.FWRuleRemove(id); err != nil {
		return err
	}

	// Remove from iptables
	if rule != nil && s.fw != nil {
		s.removeRule(rule.Table, rule.Chain, rule.RuleSpec)
	}

	return nil
}

// ListRules returns all persisted rules for a table.
func (s *FirewallService) ListRules(tableName string) ([]database.FirewallRule, error) {
	return database.FWRuleListAll(tableName)
}

// Guard returns the IP guard service for direct access to approve/reject/list etc.
func (s *FirewallService) Guard() *IPGuardService {
	return s.guard
}

// ==================== Config ====================

// GetConfig returns a firewall config value.
func (s *FirewallService) GetConfig(key string) string {
	return database.FWConfigGet(key)
}

// SetConfig sets a firewall config value.
func (s *FirewallService) SetConfig(key, value string) {
	database.FWConfigSet(key, value)
}

// ==================== Internal ====================

// seedDefaultRules adds essential rules on first enable (SSH + WebOS panel LAN access).
// Skips if any rules already exist (user may have deleted them intentionally).
func (s *FirewallService) seedDefaultRules() {
	existing, _ := database.FWRuleListAll("filter")
	if len(existing) > 0 {
		return // already has rules, don't re-seed
	}

	type seedRule struct {
		spec    string
		comment string
	}
	rules := []seedRule{
		{"-p tcp --dport 22 -j ACCEPT", "SSH 远程访问"},
	}

	// Detect LAN CIDR for 8080 access
	if cidr := detectLANCIDR(); cidr != "" {
		rules = append(rules, seedRule{
			spec:    fmt.Sprintf("-p tcp -s %s --dport %d -j ACCEPT", cidr, s.port),
			comment: fmt.Sprintf("面板内网访问 (%s)", cidr),
		})
	}

	for _, r := range rules {
		id, err := database.FWRuleAdd("filter", "INPUT", r.spec, r.comment, "system")
		if err != nil {
			log.Printf("[firewall] warning: failed to seed rule: %v", err)
			continue
		}
		if err := s.applyRule("filter", "INPUT", r.spec, false); err != nil {
			log.Printf("[firewall] warning: failed to apply seeded rule: %v", err)
			database.FWRuleRemove(id)
			continue
		}
		log.Printf("[firewall] seeded default rule: %s", r.comment)
	}
}

// cleanupUserRules removes all user-managed rules from iptables (best-effort).
func (s *FirewallService) cleanupUserRules() {
	if s.fw == nil {
		return
	}
	for _, table := range []string{"filter", "nat"} {
		rules, err := database.FWRuleListAll(table)
		if err != nil {
			continue
		}
		for _, r := range rules {
			s.removeRule(r.Table, r.Chain, r.RuleSpec)
		}
	}
}

// restoreRules replays all persisted rules from DB into iptables.
func (s *FirewallService) restoreRules() error {
	for _, table := range []string{"filter", "nat"} {
		rules, err := database.FWRuleListAll(table)
		if err != nil {
			return err
		}
		for _, r := range rules {
			if err := s.applyRule(r.Table, r.Chain, r.RuleSpec, false); err != nil {
				log.Printf("[firewall] warning: failed to restore rule #%d: %v", r.ID, err)
			}
		}
		if len(rules) > 0 {
			log.Printf("[firewall] restored %d %s rules", len(rules), table)
		}
	}
	return nil
}

// applyRule executes an iptables command to add a rule.
func (s *FirewallService) applyRule(tableName, chain, ruleSpec string, insertFirst bool) error {
	args := []string{}
	if tableName != "filter" {
		args = append(args, "-t", tableName)
	}
	if insertFirst {
		args = append(args, "-I", chain, "1")
	} else {
		args = append(args, "-A", chain)
	}
	args = append(args, strings.Fields(ruleSpec)...)
	return s.fw.Exec(args...)
}

// removeRule executes an iptables command to delete a rule.
func (s *FirewallService) removeRule(tableName, chain, ruleSpec string) {
	args := []string{}
	if tableName != "filter" {
		args = append(args, "-t", tableName)
	}
	args = append(args, "-D", chain)
	args = append(args, strings.Fields(ruleSpec)...)
	s.fw.Exec(args...)
}

// detectLANCIDR finds the first physical non-loopback interface's private IPv4 /24 subnet.
func detectLANCIDR() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		name := iface.Name
		if strings.HasPrefix(name, "veth") || strings.HasPrefix(name, "docker") ||
			strings.HasPrefix(name, "br-") || strings.HasPrefix(name, "wg") ||
			strings.HasPrefix(name, "tun") || strings.HasPrefix(name, "tap") ||
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
			if v4 := ip.To4(); v4 != nil && isPrivateIP(v4) {
				return fmt.Sprintf("%d.%d.%d.0/24", v4[0], v4[1], v4[2])
			}
		}
	}
	return ""
}
