package service

import (
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// WatchCallback is called when a watched directory changes.
type WatchCallback func()

type watchEntry struct {
	subscribers   map[string]WatchCallback
	debounceTimer *time.Timer
	firstEvent    time.Time // time of first event in current debounce window
}

// FileWatcher watches directories for changes and notifies subscribers.
type FileWatcher struct {
	mu       sync.Mutex
	watcher  *fsnotify.Watcher
	watches  map[string]*watchEntry
	closed   bool
	stopOnce sync.Once
	stopCh   chan struct{}
}

var (
	fileWatcherOnce     sync.Once
	fileWatcherInstance *FileWatcher
)

// GetFileWatcher returns the singleton FileWatcher instance.
func GetFileWatcher() *FileWatcher {
	fileWatcherOnce.Do(func() {
		fileWatcherInstance = &FileWatcher{
			watches: make(map[string]*watchEntry),
			stopCh:  make(chan struct{}),
		}
	})
	return fileWatcherInstance
}

// Subscribe registers a callback for changes in absPath.
// The first subscriber for a path starts the fsnotify watch.
func (fw *FileWatcher) Subscribe(absPath, subscriberID string, cb WatchCallback) error {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	if fw.closed {
		return fmt.Errorf("file watcher is closed")
	}

	// Lazy-init the fsnotify watcher on first subscribe
	if fw.watcher == nil {
		w, err := fsnotify.NewWatcher()
		if err != nil {
			return fmt.Errorf("failed to create fsnotify watcher: %w", err)
		}
		fw.watcher = w
		go fw.eventLoop()
	}

	entry, ok := fw.watches[absPath]
	if !ok {
		// First subscriber for this path — add to fsnotify
		if err := fw.watcher.Add(absPath); err != nil {
			return fmt.Errorf("failed to watch %s: %w", absPath, err)
		}
		entry = &watchEntry{
			subscribers: make(map[string]WatchCallback),
		}
		fw.watches[absPath] = entry
	}

	entry.subscribers[subscriberID] = cb
	return nil
}

// Unsubscribe removes a subscriber for a path.
// When the last subscriber is removed, the fsnotify watch is removed.
func (fw *FileWatcher) Unsubscribe(absPath, subscriberID string) {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	entry, ok := fw.watches[absPath]
	if !ok {
		return
	}

	delete(entry.subscribers, subscriberID)

	if len(entry.subscribers) == 0 {
		if entry.debounceTimer != nil {
			entry.debounceTimer.Stop()
		}
		if fw.watcher != nil {
			fw.watcher.Remove(absPath)
		}
		delete(fw.watches, absPath)

		// If no watches remain, close the fsnotify watcher to free resources
		if len(fw.watches) == 0 && fw.watcher != nil {
			fw.watcher.Close()
			fw.watcher = nil
		}
	}
}

// UnsubscribeAll removes all subscriptions for a given subscriber ID.
func (fw *FileWatcher) UnsubscribeAll(subscriberID string) {
	fw.mu.Lock()
	// Collect paths to unsubscribe (avoid modifying map while iterating)
	var paths []string
	for absPath, entry := range fw.watches {
		if _, ok := entry.subscribers[subscriberID]; ok {
			paths = append(paths, absPath)
		}
	}
	fw.mu.Unlock()

	for _, p := range paths {
		fw.Unsubscribe(p, subscriberID)
	}
}

// eventLoop listens for fsnotify events and triggers debounced callbacks.
func (fw *FileWatcher) eventLoop() {
	for {
		select {
		case event, ok := <-fw.watcher.Events:
			if !ok {
				return
			}
			// Only react to meaningful changes
			if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) == 0 {
				continue
			}
			dirPath := filepath.Dir(event.Name)
			fw.triggerDebounce(dirPath)

		case _, ok := <-fw.watcher.Errors:
			if !ok {
				return
			}
			// Log but continue
		}
	}
}

// triggerDebounce resets the debounce timer for a directory.
// If events keep arriving, it forces a callback after maxDebounceWait.
func (fw *FileWatcher) triggerDebounce(dirPath string) {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	entry, ok := fw.watches[dirPath]
	if !ok {
		return
	}

	now := time.Now()
	if entry.firstEvent.IsZero() {
		entry.firstEvent = now
	}

	const debounceDelay = 500 * time.Millisecond
	const maxDebounceWait = 3 * time.Second

	// If we've been debouncing too long, fire immediately
	if now.Sub(entry.firstEvent) >= maxDebounceWait {
		if entry.debounceTimer != nil {
			entry.debounceTimer.Stop()
			entry.debounceTimer = nil
		}
		entry.firstEvent = time.Time{}
		cbs := make([]WatchCallback, 0, len(entry.subscribers))
		for _, cb := range entry.subscribers {
			cbs = append(cbs, cb)
		}
		fw.mu.Unlock()
		for _, cb := range cbs {
			cb()
		}
		fw.mu.Lock()
		return
	}

	if entry.debounceTimer != nil {
		entry.debounceTimer.Stop()
	}

	entry.debounceTimer = time.AfterFunc(debounceDelay, func() {
		fw.mu.Lock()
		e, ok := fw.watches[dirPath]
		if !ok {
			fw.mu.Unlock()
			return
		}
		e.firstEvent = time.Time{}
		// Copy callbacks to avoid holding lock during execution
		cbs := make([]WatchCallback, 0, len(e.subscribers))
		for _, cb := range e.subscribers {
			cbs = append(cbs, cb)
		}
		fw.mu.Unlock()

		for _, cb := range cbs {
			cb()
		}
	})
}
