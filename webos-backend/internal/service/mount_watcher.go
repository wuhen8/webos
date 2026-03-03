package service

import (
	"sync"
)

// MountInfo represents a single mount entry.
type MountInfo struct {
	Device     string `json:"device"`
	MountPoint string `json:"mountPoint"`
	FsType     string `json:"fsType"`
	Name       string `json:"name"`
}

// MountWatchCallback is called when iso9660 mounts change.
type MountWatchCallback func(mounts []MountInfo)

// MountWatcher monitors mount changes for iso9660 mounts.
type MountWatcher struct {
	mu          sync.Mutex
	subscribers map[string]MountWatchCallback
	lastMounts  []MountInfo
	stopCh      chan struct{}
	running     bool
}

var (
	mountWatcherOnce     sync.Once
	mountWatcherInstance *MountWatcher
)

// GetMountWatcher returns the singleton MountWatcher instance.
func GetMountWatcher() *MountWatcher {
	mountWatcherOnce.Do(func() {
		mountWatcherInstance = &MountWatcher{
			subscribers: make(map[string]MountWatchCallback),
		}
	})
	return mountWatcherInstance
}

// Subscribe registers a callback for mount changes.
func (mw *MountWatcher) Subscribe(subscriberID string, cb MountWatchCallback) {
	mw.mu.Lock()
	defer mw.mu.Unlock()

	mw.subscribers[subscriberID] = cb

	// Start watching if this is the first subscriber
	if !mw.running {
		mw.running = true
		mw.stopCh = make(chan struct{})
		go mw.pollLoop()
	}

	// Send current state immediately
	mounts := parseIsoMounts()
	mw.lastMounts = mounts
	go cb(mounts)
}

// Unsubscribe removes a subscriber.
func (mw *MountWatcher) Unsubscribe(subscriberID string) {
	mw.mu.Lock()
	defer mw.mu.Unlock()

	delete(mw.subscribers, subscriberID)

	// Stop watching if no subscribers remain
	if len(mw.subscribers) == 0 && mw.running {
		close(mw.stopCh)
		mw.running = false
	}
}

func (mw *MountWatcher) notifyIfChanged() {
	mounts := parseIsoMounts()

	mw.mu.Lock()
	if mountsEqual(mw.lastMounts, mounts) {
		mw.mu.Unlock()
		return
	}
	mw.lastMounts = mounts
	cbs := make([]MountWatchCallback, 0, len(mw.subscribers))
	for _, cb := range mw.subscribers {
		cbs = append(cbs, cb)
	}
	mw.mu.Unlock()

	for _, cb := range cbs {
		cb(mounts)
	}
}

func mountsEqual(a, b []MountInfo) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Device != b[i].Device || a[i].MountPoint != b[i].MountPoint {
			return false
		}
	}
	return true
}
