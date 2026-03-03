//go:build linux

package service

import (
	"bufio"
	"os"
	"strings"
	"time"

	"golang.org/x/sys/unix"
)

// pollLoop uses poll(2) on /proc/mounts to detect mount changes.
func (mw *MountWatcher) pollLoop() {
	f, err := os.Open("/proc/mounts")
	if err != nil {
		return
	}
	defer f.Close()
	fd := int(f.Fd())

	for {
		select {
		case <-mw.stopCh:
			return
		default:
		}

		pollFds := []unix.PollFd{{
			Fd:     int32(fd),
			Events: unix.POLLPRI,
		}}
		n, err := unix.Poll(pollFds, 1000)
		if err != nil {
			if err == unix.EINTR {
				continue
			}
			time.Sleep(time.Second)
			continue
		}
		if n > 0 && (pollFds[0].Revents&(unix.POLLPRI|unix.POLLERR)) != 0 {
			time.Sleep(200 * time.Millisecond)
			mw.notifyIfChanged()
		}
	}
}

// parseIsoMounts reads /proc/mounts and returns iso9660 entries.
func parseIsoMounts() []MountInfo {
	f, err := os.Open("/proc/mounts")
	if err != nil {
		return nil
	}
	defer f.Close()

	var mounts []MountInfo
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 {
			continue
		}
		if fields[2] == "iso9660" {
			device := fields[0]
			mountPoint := fields[1]
			name := device
			if idx := strings.LastIndex(device, "/"); idx >= 0 {
				name = device[idx+1:]
			}
			mounts = append(mounts, MountInfo{
				Device:     device,
				MountPoint: mountPoint,
				FsType:     fields[2],
				Name:       name,
			})
		}
	}
	return mounts
}
