//go:build darwin

package service

import (
	"os"
	"path/filepath"
	"syscall"
)

// findMountPoint returns the mount point that contains the given absolute path.
func findMountPoint(absPath string) (string, error) {
	info, err := os.Stat(absPath)
	if err != nil {
		absPath = filepath.Dir(absPath)
		info, err = os.Stat(absPath)
		if err != nil {
			return "/", nil
		}
	}

	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return "/", nil
	}
	dev := stat.Dev

	current := absPath
	if !info.IsDir() {
		current = filepath.Dir(current)
	}

	for {
		parent := filepath.Dir(current)
		if parent == current {
			return current, nil
		}
		parentInfo, err := os.Stat(parent)
		if err != nil {
			return current, nil
		}
		parentStat, ok := parentInfo.Sys().(*syscall.Stat_t)
		if !ok {
			return current, nil
		}
		if parentStat.Dev != dev {
			return current, nil
		}
		current = parent
	}
}

// listMountPoints on macOS returns /Volumes/* entries plus /.
// macOS mounts external/additional volumes under /Volumes.
func listMountPoints() []string {
	points := []string{"/"}
	entries, err := os.ReadDir("/Volumes")
	if err != nil {
		return points
	}
	for _, e := range entries {
		points = append(points, filepath.Join("/Volumes", e.Name()))
	}
	return points
}
