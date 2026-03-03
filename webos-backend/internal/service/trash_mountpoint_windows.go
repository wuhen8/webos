//go:build windows

package service

import (
	"path/filepath"
	"syscall"
)

// findMountPoint on Windows returns the volume root (e.g. "C:\").
func findMountPoint(absPath string) (string, error) {
	return filepath.VolumeName(absPath) + `\`, nil
}

// listMountPoints returns all drive letters present on the system.
func listMountPoints() []string {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	proc := kernel32.NewProc("GetLogicalDrives")
	ret, _, _ := proc.Call()
	mask := uint32(ret)

	var points []string
	for i := 0; i < 26; i++ {
		if mask&(1<<uint(i)) != 0 {
			letter := string(rune('A'+i)) + `:\`
			points = append(points, letter)
		}
	}
	return points
}
