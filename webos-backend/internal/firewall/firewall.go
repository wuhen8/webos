// Package firewall provides a cross-platform abstraction for managing firewall rules.
// Currently only Linux (iptables) is fully implemented; macOS and Windows are stubs.
package firewall

// No imports needed — platform selection is in build-tagged files.

// Rule represents a single firewall rule.
type Rule struct {
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	Protocol string `json:"protocol"` // tcp, udp
	Action   string `json:"action"`   // ACCEPT, DROP
	Comment  string `json:"comment"`
}

// Firewall is the platform-agnostic interface for managing firewall rules.
type Firewall interface {
	// Init sets up the firewall chain/anchor for IP guard.
	Init(port int) error

	// AllowIP adds an ACCEPT rule for the given IP on the guarded port.
	AllowIP(ip string, port int, comment string) error

	// BlockIP explicitly adds a DROP rule (usually not needed if default is DROP).
	BlockIP(ip string, port int) error

	// RemoveIP removes the ACCEPT rule for the given IP.
	RemoveIP(ip string, port int) error

	// ListAllowed returns all currently allowed IPs on the guarded port.
	ListAllowed(port int) ([]Rule, error)

	// EnableLogNewConn installs a LOG rule so new connection attempts are logged.
	EnableLogNewConn(port int) error

	// DisableLogNewConn removes the LOG rule.
	DisableLogNewConn(port int) error

	// Cleanup removes all IP guard rules (called on shutdown if desired).
	Cleanup(port int) error

	// Exec runs a raw iptables command with the given arguments.
	// Used by FirewallService for user-defined rules.
	Exec(args ...string) error
}

// New returns a Firewall implementation for the current platform.
// Implemented in platform-specific files (firewall_linux.go, firewall_darwin.go, firewall_windows.go).
func New() (Firewall, error) {
	return newPlatformFirewall()
}
