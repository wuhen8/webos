// Package pubsub provides a protocol-agnostic publish/subscribe engine.
//
// Channels are registered with a fetch function and a push mode (poll or event).
// Transport adapters (WebSocket, wasm, gRPC, …) subscribe Sink implementations
// and receive data pushes without the engine knowing anything about the protocol.
package pubsub

import (
	"fmt"
	"log"
	"sync"
	"time"
)

// ==================== Sink interface ====================

// Sink is the only thing a transport adapter needs to implement.
// The pubsub engine calls Push when data is available.
type Sink interface {
	// Push sends data for the given channel to the client.
	Push(channel string, data interface{})
}

// ==================== Channel definition ====================

// Mode defines how a channel delivers data.
type Mode int

const (
	// Poll means the engine calls Fetch on a timer and pushes the result.
	Poll Mode = iota
	// Event means the engine only pushes when Publish is called externally.
	Event
)

// ChannelDef describes a subscribable data channel.
type ChannelDef struct {
	Name            string
	Mode            Mode
	DefaultInterval time.Duration // only used for Poll channels
	// Fetch returns the current data snapshot.
	// Called immediately on subscribe, and on each tick for Poll channels.
	Fetch func() (interface{}, error)
	// OnFirstSubscribe is called when the subscriber count goes from 0 → 1. Optional.
	OnFirstSubscribe func()
	// OnLastUnsubscribe is called when the subscriber count goes from 1 → 0. Optional.
	OnLastUnsubscribe func()
}

// ==================== Engine ====================

// Engine is the central pubsub coordinator.
type Engine struct {
	mu       sync.RWMutex
	channels map[string]*ChannelDef
	// sinkID -> Sink
	sinks map[string]Sink
	// channel -> set of sinkIDs
	subs map[string]map[string]struct{}
	// sinkID:channel -> ticker stop channel (for poll subscriptions)
	tickers map[string]chan struct{}
}

// New creates a new pubsub engine.
func New() *Engine {
	return &Engine{
		channels: make(map[string]*ChannelDef),
		sinks:    make(map[string]Sink),
		subs:     make(map[string]map[string]struct{}),
		tickers:  make(map[string]chan struct{}),
	}
}

// Register adds a channel definition. Safe to call from init().
func (e *Engine) Register(def *ChannelDef) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.channels[def.Name] = def
}

// GetChannel returns the definition for a channel, or nil.
func (e *Engine) GetChannel(name string) *ChannelDef {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.channels[name]
}

// ChannelNames returns all registered channel names.
func (e *Engine) ChannelNames() []string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	names := make([]string, 0, len(e.channels))
	for k := range e.channels {
		names = append(names, k)
	}
	return names
}

// RegisterSink registers a transport-level sink (e.g. a WebSocket connection).
// Must be called before Subscribe.
func (e *Engine) RegisterSink(id string, sink Sink) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.sinks[id] = sink
}

// UnregisterSink removes a sink and all its subscriptions.
func (e *Engine) UnregisterSink(id string) {
	e.mu.Lock()

	// Collect channels this sink was subscribed to
	var chans []string
	for ch, members := range e.subs {
		if _, ok := members[id]; ok {
			chans = append(chans, ch)
		}
	}

	// Stop tickers and remove from sub sets
	for _, ch := range chans {
		tickKey := id + ":" + ch
		if stop, ok := e.tickers[tickKey]; ok {
			close(stop)
			delete(e.tickers, tickKey)
		}
		delete(e.subs[ch], id)
	}
	delete(e.sinks, id)

	// Snapshot callbacks to call outside lock
	type cb struct {
		ch string
		fn func()
	}
	var callbacks []cb
	for _, ch := range chans {
		if len(e.subs[ch]) == 0 {
			delete(e.subs, ch)
			if def, ok := e.channels[ch]; ok && def.OnLastUnsubscribe != nil {
				callbacks = append(callbacks, cb{ch, def.OnLastUnsubscribe})
			}
		}
	}
	e.mu.Unlock()

	for _, c := range callbacks {
		c.fn()
	}
}

// Subscribe subscribes a sink to a channel.
// Immediately pushes the current snapshot, then:
//   - Poll channels: starts a ticker that calls Fetch periodically
//   - Event channels: waits for Publish calls
//
// intervalOverride overrides the default poll interval if > 0.
func (e *Engine) Subscribe(sinkID, channel string, intervalOverride time.Duration) error {
	e.mu.Lock()
	def, ok := e.channels[channel]
	if !ok {
		e.mu.Unlock()
		return fmt.Errorf("unknown channel: %s", channel)
	}
	sink, ok := e.sinks[sinkID]
	if !ok {
		e.mu.Unlock()
		return fmt.Errorf("unknown sink: %s", sinkID)
	}

	// Already subscribed? Stop old ticker first.
	tickKey := sinkID + ":" + channel
	if stop, ok := e.tickers[tickKey]; ok {
		close(stop)
		delete(e.tickers, tickKey)
	}

	wasEmpty := len(e.subs[channel]) == 0
	if e.subs[channel] == nil {
		e.subs[channel] = make(map[string]struct{})
	}
	e.subs[channel][sinkID] = struct{}{}

	var onFirst func()
	if wasEmpty && def.OnFirstSubscribe != nil {
		onFirst = def.OnFirstSubscribe
	}
	e.mu.Unlock()

	if onFirst != nil {
		onFirst()
	}

	// Immediate push
	go e.pushToSink(sink, channel, def)

	// Start ticker for poll channels
	if def.Mode == Poll {
		interval := def.DefaultInterval
		if intervalOverride > 0 {
			interval = intervalOverride
		}
		if interval < time.Second {
			interval = time.Second
		}
		stop := make(chan struct{})
		e.mu.Lock()
		e.tickers[tickKey] = stop
		e.mu.Unlock()

		go func() {
			ticker := time.NewTicker(interval)
			defer ticker.Stop()
			for {
				select {
				case <-stop:
					return
				case <-ticker.C:
					e.mu.RLock()
					s, ok := e.sinks[sinkID]
					_, subscribed := e.subs[channel][sinkID]
					e.mu.RUnlock()
					if !ok || !subscribed {
						return
					}
					e.pushToSink(s, channel, def)
				}
			}
		}()
	}

	return nil
}

// Unsubscribe removes a sink's subscription to a channel.
func (e *Engine) Unsubscribe(sinkID, channel string) {
	e.mu.Lock()

	tickKey := sinkID + ":" + channel
	if stop, ok := e.tickers[tickKey]; ok {
		close(stop)
		delete(e.tickers, tickKey)
	}

	if members, ok := e.subs[channel]; ok {
		delete(members, sinkID)
		if len(members) == 0 {
			delete(e.subs, channel)
			if def, ok := e.channels[channel]; ok && def.OnLastUnsubscribe != nil {
				fn := def.OnLastUnsubscribe
				e.mu.Unlock()
				fn()
				return
			}
		}
	}
	e.mu.Unlock()
}

// UnsubscribeAll removes all subscriptions for a sink (convenience for disconnect).
func (e *Engine) UnsubscribeAll(sinkID string) {
	e.mu.Lock()
	var chans []string
	for ch, members := range e.subs {
		if _, ok := members[sinkID]; ok {
			chans = append(chans, ch)
		}
	}
	e.mu.Unlock()

	for _, ch := range chans {
		e.Unsubscribe(sinkID, ch)
	}
}

// Publish pushes data to all subscribers of a channel.
// For event-driven channels, this is the primary way data gets pushed.
// For poll channels, this can be used to push an immediate update (e.g. after a mutation).
func (e *Engine) Publish(channel string, data interface{}) {
	e.mu.RLock()
	members, ok := e.subs[channel]
	if !ok || len(members) == 0 {
		e.mu.RUnlock()
		return
	}
	// Snapshot sinks
	sinks := make([]Sink, 0, len(members))
	for sinkID := range members {
		if s, ok := e.sinks[sinkID]; ok {
			sinks = append(sinks, s)
		}
	}
	e.mu.RUnlock()

	for _, s := range sinks {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[pubsub] sink panicked on channel %s: %v", channel, r)
				}
			}()
			s.Push(channel, data)
		}()
	}
}

// PublishFetch fetches the latest data for a channel and publishes it to all subscribers.
// Convenience method for event-driven channels where the caller just wants to say "data changed".
func (e *Engine) PublishFetch(channel string) {
	e.mu.RLock()
	def, ok := e.channels[channel]
	e.mu.RUnlock()
	if !ok || def.Fetch == nil {
		return
	}
	data, err := def.Fetch()
	if err != nil {
		log.Printf("[pubsub] fetch error for channel %s: %v", channel, err)
		return
	}
	e.Publish(channel, data)
}

// pushToSink fetches data and pushes to a single sink.
func (e *Engine) pushToSink(sink Sink, channel string, def *ChannelDef) {
	if def.Fetch == nil {
		return
	}
	data, err := def.Fetch()
	if err != nil {
		log.Printf("[pubsub] fetch error for channel %s: %v", channel, err)
		return
	}
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[pubsub] sink panicked on channel %s: %v", channel, r)
			}
		}()
		sink.Push(channel, data)
	}()
}
