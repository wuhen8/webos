//go:build !linux

package firewall

import "fmt"

type stubLogWatcher struct{}

func NewLogWatcher() LogWatcher {
	return &stubLogWatcher{}
}

func (w *stubLogWatcher) Start() (<-chan LogEvent, error) {
	return nil, fmt.Errorf("log watcher not implemented on this platform")
}

func (w *stubLogWatcher) Stop() {}
