//go:build windows

package firewall

import "fmt"

type windowsFirewall struct{}

func newPlatformFirewall() (Firewall, error) {
	return &windowsFirewall{}, nil
}

func (f *windowsFirewall) Init(port int) error {
	return fmt.Errorf("Windows firewall (netsh) not yet implemented")
}

func (f *windowsFirewall) AllowIP(ip string, port int, comment string) error {
	return fmt.Errorf("Windows firewall (netsh) not yet implemented")
}

func (f *windowsFirewall) BlockIP(ip string, port int) error {
	return fmt.Errorf("Windows firewall (netsh) not yet implemented")
}

func (f *windowsFirewall) RemoveIP(ip string, port int) error {
	return fmt.Errorf("Windows firewall (netsh) not yet implemented")
}

func (f *windowsFirewall) ListAllowed(port int) ([]Rule, error) {
	return nil, fmt.Errorf("Windows firewall (netsh) not yet implemented")
}

func (f *windowsFirewall) EnableLogNewConn(port int) error {
	return fmt.Errorf("Windows firewall (netsh) not yet implemented")
}

func (f *windowsFirewall) DisableLogNewConn(port int) error {
	return fmt.Errorf("Windows firewall (netsh) not yet implemented")
}

func (f *windowsFirewall) Cleanup(port int) error {
	return fmt.Errorf("Windows firewall (netsh) not yet implemented")
}
