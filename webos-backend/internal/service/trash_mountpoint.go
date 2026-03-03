//go:build linux

package service

import (
	"bufio"
	"os"
	"path/filepath"
	"syscall"
)

// findMountPoint returns the mount point that contains the given absolute path.
// It walks up the directory tree comparing device IDs until the device changes.
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

// listMountPoints reads /proc/mounts and returns all mount point paths.
func listMountPoints() []string {
	f, err := os.Open("/proc/mounts")
	if err != nil {
		return nil
	}
	defer f.Close()

	seen := make(map[string]bool)
	var points []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := splitFields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		mp := fields[1]
		if !seen[mp] {
			seen[mp] = true
			points = append(points, mp)
		}
	}
	return points
}

// splitFields splits a line by whitespace (avoids importing strings just for this).
func splitFields(s string) []string {
	var fields []string
	start := -1
	for i, c := range s {
		if c == ' ' || c == '\t' {
			if start >= 0 {
				fields = append(fields, s[start:i])
				start = -1
			}
		} else if start < 0 {
			start = i
		}
	}
	if start >= 0 {
		fields = append(fields, s[start:])
	}
	return fields
}
