package pubsub

// Default is the application-wide pubsub engine.
// All service-layer channel registrations and handler-layer subscriptions use this.
var Default = New()
