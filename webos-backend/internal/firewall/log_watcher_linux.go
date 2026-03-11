//go:build linux

package firewall

import (
	"bufio"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var logRe = regexp.MustCompile(`WEBOS_GUARD:.*SRC=(\S+).*DPT=(\d+)`)

// knownLogPaths are the fallback locations for kernel log on Linux.
var knownLogPaths = []string{
	"/var/log/kern.log",
	"/var/log/messages",
	"/var/log/syslog",
}

type linuxLogWatcher struct {
	ch     chan LogEvent
	stopCh chan struct{}
	once   sync.Once
	cmd    *exec.Cmd
}

// NewLogWatcher returns a LogWatcher for the current platform.
func NewLogWatcher() LogWatcher {
	return &linuxLogWatcher{
		ch:     make(chan LogEvent, 64),
		stopCh: make(chan struct{}),
	}
}

func (w *linuxLogWatcher) Start() (<-chan LogEvent, error) {
	// Prefer journalctl (Debian 13+ / systemd-based systems)
	if path, err := exec.LookPath("journalctl"); err == nil && path != "" {
		go w.tailJournal()
		return w.ch, nil
	}

	// Fallback: traditional log files
	for _, p := range knownLogPaths {
		if _, err := os.Stat(p); err == nil {
			go w.tailFile(p)
			return w.ch, nil
		}
	}

	return nil, nil // no source available, caller uses polling fallback
}

func (w *linuxLogWatcher) Stop() {
	w.once.Do(func() {
		close(w.stopCh)
		if w.cmd != nil && w.cmd.Process != nil {
			w.cmd.Process.Kill()
		}
	})
}

// tailJournal streams kernel logs via journalctl -k -f --grep=WEBOS_GUARD
func (w *linuxLogWatcher) tailJournal() {
	defer close(w.ch)

	for {
		select {
		case <-w.stopCh:
			return
		default:
		}

		w.cmd = exec.Command("journalctl", "-k", "-f", "-n", "0", "--grep=WEBOS_GUARD", "--no-pager")
		stdout, err := w.cmd.StdoutPipe()
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		if err := w.cmd.Start(); err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		scanner := bufio.NewScanner(stdout)
		done := make(chan struct{})
		go func() {
			defer close(done)
			for scanner.Scan() {
				line := scanner.Text()
				w.parseLine(line)
			}
		}()

		select {
		case <-w.stopCh:
			w.cmd.Process.Kill()
			w.cmd.Wait()
			return
		case <-done:
			// journalctl exited unexpectedly, restart after delay
			w.cmd.Wait()
			time.Sleep(3 * time.Second)
		}
	}
}

// tailFile watches a traditional log file by seeking to end and tailing.
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
				time.Sleep(500 * time.Millisecond)
				continue
			}

			w.parseLine(line)
		}
	}
}

func (w *linuxLogWatcher) parseLine(line string) {
	if !strings.Contains(line, "WEBOS_GUARD:") {
		return
	}
	matches := logRe.FindStringSubmatch(line)
	if len(matches) < 3 {
		return
	}
	port, _ := strconv.Atoi(matches[2])
	select {
	case w.ch <- LogEvent{SrcIP: matches[1], DstPort: port}:
	default:
	}
}
