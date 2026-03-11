//go:build darwin

package firewall

import "fmt"

type darwinFirewall struct{}

func newPlatformFirewall() (Firewall, error) {
	return &darwinFirewall{}, nil
}

func (f *darwinFirewall) Init(port int) error {
	return fmt.Errorf("macOS firewall (pf) not yet implemented")
}

func (f *darwinFirewall) AllowIP(ip string, port int, comment string) error {
	return fmt.Errorf("macOS firewall (pf) not yet implemented")
}

func (f *darwinFirewall) BlockIP(ip string, port int) error {
	return fmt.Errorf("macOS firewall (pf) not yet implemented")
}

func (f *darwinFirewall) RemoveIP(ip string, port int) error {
	return fmt.Errorf("macOS firewall (pf) not yet implemented")
}

func (f *darwinFirewall) ListAllowed(port int) ([]Rule, error) {
	return nil, fmt.Errorf("macOS firewall (pf) not yet implemented")
}

func (f *darwinFirewall) EnableLogNewConn(port int) error {
	return fmt.Errorf("macOS firewall (pf) not yet implemented")
}

func (f *darwinFirewall) DisableLogNewConn(port int) error {
	return fmt.Errorf("macOS firewall (pf) not yet implemented")
}

func (f *darwinFirewall) Cleanup(port int) error {
	return fmt.Errorf("macOS firewall (pf) not yet implemented")
}
func (f *darwinFirewall) Exec(args ...string) error {
	return fmt.Errorf("macOS firewall (pf) not yet implemented")
}
