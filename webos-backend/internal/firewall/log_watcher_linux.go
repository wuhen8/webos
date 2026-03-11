//go:build linux

package firewall

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var logRe = regexp.MustCompile(`WEBOS_GUARD:.*SRC=(\S+).*DPT=(\d+)`)

// knownLogPaths are the common locations for kernel log on Linux.
var knownLogPaths = []string{
	"/var/log/kern.log",
	"/var/log/messages",
	"/var/log/syslog",
}

type linuxLogWatcher struct {
	ch     chan LogEvent
	stopCh chan struct{}
	once   sync.Once
}

// NewLogWatcher returns a LogWatcher for the current platform.
func NewLogWatcher() LogWatcher {
	return &linuxLogWatcher{
		ch:     make(chan LogEvent, 64),
		stopCh: make(chan struct{}),
	}
}

func (w *linuxLogWatcher) Start() (<-chan LogEvent, error) {
	logPath := ""
	for _, p := range knownLogPaths {
		if _, err := os.Stat(p); err == nil {
			logPath = p
			break
		}
	}
	if logPath == "" {
		return nil, fmt.Errorf("no kernel log file found, tried: %s", strings.Join(knownLogPaths, ", "))
	}

	go w.tailFile(logPath)
	return w.ch, nil
}

func (w *linuxLogWatcher) Stop() {
	w.once.Do(func() {
		close(w.stopCh)
	})
}

func (w *linuxLogWatcher) tailFile(path string) {
	defer close(w.ch)

	for {
		select {
		case <-w.stopCh:
			return
		default:
		}

		f, err := os.Open(path)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		// Seek to end
		f.Seek(0, io.SeekEnd)
		reader := bufio.NewReader(f)

		for {
			select {
			case <-w.stopCh:
				f.Close()
				return
			default:
			}

			line, err := reader.ReadString('\n')
			if err != nil {
				// EOF — wait and retry
				time.Sleep(500 * time.Millisecond)
				continue
			}

			if !strings.Contains(line, "WEBOS_GUARD:") {
				continue
			}

			matches := logRe.FindStringSubmatch(line)
			if len(matches) < 3 {
				continue
			}

			port, _ := strconv.Atoi(matches[2])
			select {
			case w.ch <- LogEvent{SrcIP: matches[1], DstPort: port}:
			default:
				// channel full, drop event
			}
		}
	}
}
