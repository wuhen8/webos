// Package firewall - log_watcher.go provides the interface for watching firewall logs.
package firewall

// LogEvent represents a parsed firewall log entry.
type LogEvent struct {
	SrcIP   string
	DstPort int
}

// LogWatcher watches firewall logs for new connection attempts.
type LogWatcher interface {
	// Start begins watching. Events are sent to the returned channel.
	Start() (<-chan LogEvent, error)
	// Stop stops watching and closes the channel.
	Stop()
}
