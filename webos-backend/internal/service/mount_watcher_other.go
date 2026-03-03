//go:build !linux

package service

import "time"

// pollLoop on non-Linux platforms uses a simple ticker to periodically check for changes.
func (mw *MountWatcher) pollLoop() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-mw.stopCh:
			return
		case <-ticker.C:
			mw.notifyIfChanged()
		}
	}
}

// parseIsoMounts is a no-op on non-Linux platforms since /proc/mounts is not available.
func parseIsoMounts() []MountInfo {
	return nil
}
