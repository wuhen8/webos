package auth

import (
	"sync"
	"time"
)

const (
	maxLoginFailures = 5
	lockDuration     = 15 * time.Minute
	cleanupInterval  = 30 * time.Minute
)

type loginRecord struct {
	mu          sync.Mutex
	failCount   int
	lockedUntil time.Time
}

var (
	loginRecords sync.Map
	cleanupOnce  sync.Once
	cleanupStop  chan struct{}
)

func startCleanup() {
	cleanupOnce.Do(func() {
		cleanupStop = make(chan struct{})
		go func() {
			ticker := time.NewTicker(cleanupInterval)
			defer ticker.Stop()
			for {
				select {
				case <-cleanupStop:
					return
				case <-ticker.C:
					now := time.Now()
					loginRecords.Range(func(key, value any) bool {
						rec := value.(*loginRecord)
						rec.mu.Lock()
						shouldDelete := rec.failCount == 0 || (!rec.lockedUntil.IsZero() && now.After(rec.lockedUntil))
						rec.mu.Unlock()
						if shouldDelete {
							loginRecords.Delete(key)
						}
						return true
					})
				}
			}
		}()
	})
}

// StopCleanup stops the background cleanup goroutine. Call during graceful shutdown.
func StopCleanup() {
	if cleanupStop != nil {
		select {
		case <-cleanupStop:
		default:
			close(cleanupStop)
		}
	}
}

// IsIPLocked checks if an IP is locked due to too many failed login attempts.
// Returns whether it's locked and the remaining lock duration.
func IsIPLocked(ip string) (bool, time.Duration) {
	startCleanup()
	val, ok := loginRecords.Load(ip)
	if !ok {
		return false, 0
	}
	rec := val.(*loginRecord)
	rec.mu.Lock()
	defer rec.mu.Unlock()
	if rec.lockedUntil.IsZero() {
		return false, 0
	}
	remaining := time.Until(rec.lockedUntil)
	if remaining <= 0 {
		rec.failCount = 0
		rec.lockedUntil = time.Time{}
		return false, 0
	}
	return true, remaining
}

// RecordLoginFailure records a failed login attempt for the given IP.
func RecordLoginFailure(ip string) {
	startCleanup()
	val, _ := loginRecords.LoadOrStore(ip, &loginRecord{})
	rec := val.(*loginRecord)
	rec.mu.Lock()
	defer rec.mu.Unlock()
	rec.failCount++
	if rec.failCount >= maxLoginFailures {
		rec.lockedUntil = time.Now().Add(lockDuration)
	}
}

// ResetLoginFailures clears the failure record for the given IP after a successful login.
func ResetLoginFailures(ip string) {
	loginRecords.Delete(ip)
}
