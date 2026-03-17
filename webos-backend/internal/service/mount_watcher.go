package service

import (
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// MountInfo represents a single mount entry.
type MountInfo struct {
	Device     string `json:"device"`
	MountPoint string `json:"mountPoint"`
	FsType     string `json:"fsType"`
	Name       string `json:"name"`
}

// ParseIsoMounts returns currently mounted iso9660 / cd9660 filesystems.
// Cross-platform: uses the `mount` command available on Linux, macOS, and BSDs.
func ParseIsoMounts() []MountInfo {
	out, err := exec.Command("mount").Output()
	if err != nil {
		return []MountInfo{} // 返回空数组而不是 nil
	}
	result := parseIsoMountsFromOutput(string(out))
	if result == nil {
		return []MountInfo{} // 确保返回空数组
	}
	return result
}

// parseIsoMountsFromOutput parses `mount` output.
// Linux format:  /dev/loop0 on /mnt/iso type iso9660 (ro,relatime)
// macOS format:  /dev/disk4 on /Volumes/DISC (cd9660, local, nodev, nosuid, read-only)
func parseIsoMountsFromOutput(output string) []MountInfo {
	var mounts []MountInfo
	isoTypes := map[string]bool{"iso9660": true, "cd9660": true, "udf": true}

	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Split on " on " to get device and rest
		onIdx := strings.Index(line, " on ")
		if onIdx < 0 {
			continue
		}
		device := line[:onIdx]
		rest := line[onIdx+4:]

		var mountPoint, fsType string

		if runtime.GOOS == "linux" {
			// Linux: /mnt/iso type iso9660 (ro,relatime)
			typeIdx := strings.Index(rest, " type ")
			if typeIdx < 0 {
				continue
			}
			mountPoint = rest[:typeIdx]
			afterType := rest[typeIdx+6:]
			spIdx := strings.IndexByte(afterType, ' ')
			if spIdx < 0 {
				fsType = afterType
			} else {
				fsType = afterType[:spIdx]
			}
		} else {
			// macOS/BSD: /Volumes/DISC (cd9660, local, nodev, ...)
			parenIdx := strings.LastIndex(rest, "(")
			if parenIdx < 0 {
				continue
			}
			mountPoint = strings.TrimSpace(rest[:parenIdx])
			opts := rest[parenIdx+1:]
			opts = strings.TrimSuffix(opts, ")")
			parts := strings.SplitN(opts, ",", 2)
			fsType = strings.TrimSpace(parts[0])
		}

		if !isoTypes[fsType] {
			continue
		}

		name := filepath.Base(device)
		if name == "." || name == "/" {
			name = device
		}

		mounts = append(mounts, MountInfo{
			Device:     device,
			MountPoint: mountPoint,
			FsType:     fsType,
			Name:       name,
		})
	}
	return mounts
}
