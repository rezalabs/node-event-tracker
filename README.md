Of course, here is the comprehensive `README.md` file for the project.

-----

# Node Event Tracker 🚀

[](https://www.google.com/search?q=https://www.npmjs.com/package/node-event-tracker)
[](https://www.google.com/search?q=https://github.com/your-username/node-event-tracker/blob/main/LICENSE)
[](https://www.google.com/search?q=https://travis-ci.com/your-username/node-event-tracker)

A robust, scalable event aggregation and throttling engine for Node.js.

**Node Event Tracker** helps you manage high-volume, repetitive events to prevent alert fatigue, reduce logging costs, and protect downstream systems from floods. It intelligently groups, counts, and throttles events based on flexible, content-aware strategies.

-----

## \#\# Key Features ✨

* **Pluggable Storage:** Ships with a default `InMemoryAdapter` for single-process use and a `RedisAdapter` for distributed, horizontally-scaled applications.
* **Advanced Throttling Strategies:** Go beyond simple rate limiting with strategies like `SimpleCounter` (default) and `TokenBucket`.
* **Dynamic Configuration:** Update throttling rules for any event stream on-the-fly without restarting your application.
* **Observability:** Built-in `EventEmitter` provides hooks into every stage of the event lifecycle (`tracked`, `deferred`, `processed`, etc.) for logging and metrics.
* **Push-Based Processing:** Provide an `async` callback to have due events pushed to your code automatically, eliminating the need for polling.
* **Secure and Resilient:** Uses `SHA256` for hashing and includes protection against resource exhaustion attacks.

-----

## \#\# Installation 💻

```bash
npm install node-event-tracker redis
```

*The `redis` package is a peer dependency required for the `RedisAdapter`.*

-----

## \#\# Quick Start 🏁

Here's a basic example using the default in-memory storage and simple counter strategy.

```javascript
const EventTracker = require('node-event-tracker');

const tracker = new EventTracker({
  limit: 5, // Defer after 5 identical events
  expireTime: 60 * 1000 // Reset count for an event after 1 minute of inactivity
});

async function run() {
  const details = { code: 'E_CONN', host: 'db-1' };
  
  for (let i = 0; i < 7; i++) {
    const result = await tracker.trackEvent('database_errors', 'user-service', details);
    console.log(`[Attempt ${i+1}] Result: ${result.type}, Count: ${result.data?.count ?? 1}`);
  }
  
  // Clean up background timers
  tracker.destroy();
}

run();
```

**Output:**

```
[Attempt 1] Result: immediate, Count: 1
[Attempt 2] Result: immediate, Count: 2
[Attempt 3] Result: immediate, Count: 3
[Attempt 4] Result: immediate, Count: 4
[Attempt 5] Result: immediate, Count: 5
[Attempt 6] Result: deferred, Count: 6
[Attempt 7] Result: ignored, Count: 6
```

-----

## \#\# Core Concepts 🧠

### Storage Adapters

The tracker's state can be stored in different backends using adapters.

* **`InMemoryAdapter` (Default):** Perfect for single-process applications or testing. All data is lost on restart.
* **`RedisAdapter`:** Essential for production and distributed systems. It uses Redis to share state across multiple application instances, providing true global throttling.

**Using the `RedisAdapter`:**

```javascript
const { createClient } = require('redis');
const { EventTracker, RedisAdapter } = require('node-event-tracker');

const redisClient = createClient();
await redisClient.connect();

const tracker = new EventTracker({
  storage: new RedisAdapter({ redisClient })
});
```

### Throttling Strategies

Strategies define *how* the tracker decides to throttle events. You can select a strategy during instantiation.

* **`SimpleCounterStrategy` (Default):** Counts events and throttles when a `limit` is exceeded.
* **`TokenBucketStrategy`:** Allows for bursts of events. The "bucket" holds tokens that are consumed by events and refilled at a constant rate.

**Using the `TokenBucketStrategy`:**

```javascript
const { EventTracker, TokenBucketStrategy } = require('node-event-tracker');

const tracker = new EventTracker({
  strategy: new TokenBucketStrategy(this, {
    bucketSize: 10, // Max 10 events in a burst
    refillRate: 2   // Refill 2 tokens per second
  })
});
```

-----

## \#\# Advanced Usage 🚀

This example combines a `RedisAdapter`, `TokenBucketStrategy`, and an **automatic processor callback** for a powerful, production-ready setup.

```javascript
const { createClient } = require('redis');
const { EventTracker, RedisAdapter, TokenBucketStrategy } = require('node-event-tracker');

async function runAdvanced() {
  // 1. Setup the Redis client and adapter
  const redisClient = createClient({ database: 1 });
  await redisClient.connect();
  await redisClient.flushDb(); // Clear for clean run
  const storage = new RedisAdapter({ redisClient });

  // 2. Define a processor for due events
  const processor = async (events) => {
    console.log(`\n[PROCESSOR] Received ${events.length} due event(s) to process.`);
    // Here you would send a single aggregated alert to Slack, PagerDuty, etc.
  };

  // 3. Create the tracker with advanced config
  const tracker = new EventTracker({
    storage,
    strategy: new TokenBucketStrategy(this, { bucketSize: 5, refillRate: 1 }),
    onDeferredEventDue: processor,
    processingInterval: 5000 // Check for due events every 5 seconds
  });

  console.log('--- Simulating a burst of events ---');
  for (let i = 0; i < 7; i++) {
    await tracker.trackEvent('api_error', 'payment_gateway', { code: 503 });
  }

  console.log('\n--- Dynamically updating config for another event stream ---');
  await tracker.updateConfig('login_fail', 'ip-1.2.3.4', { bucketSize: 2 });
  console.log('Config updated for login_fail:ip-1.2.3.4');
  
  console.log('\n--- Waiting for the automatic processor to run... ---');
  await new Promise(r => setTimeout(r, 6000));

  await redisClient.quit();
  tracker.destroy();
}

runAdvanced();
```

-----

## \#\# API Reference 📖

### `new EventTracker(options)`

Creates a new tracker instance.

**`options` Object:**

* `storage` (Adapter, optional): An instance of `InMemoryAdapter` or `RedisAdapter`. **Default:** `new InMemoryAdapter()`.
* `strategy` (Strategy, optional): An instance of `SimpleCounterStrategy` or `TokenBucketStrategy`. **Default:** `new SimpleCounterStrategy(this)`.
* `limit` (Number, optional): For `SimpleCounterStrategy`, the max events before deferring. **Default:** `5`.
* `expireTime` (Number, optional): Milliseconds of inactivity before a record is considered stale. **Default:** `86400000` (24 hours).
* `deferInterval` (Number, optional): Milliseconds to wait before a deferred event can be reprocessed. **Default:** `3600000` (1 hour).
* `maxKeys` (Number, optional): Max unique keys to track (a DoS protection feature). **Default:** `0` (unlimited).
* `onDeferredEventDue` (Function, optional): An `async` callback to process due events.
* `processingInterval` (Number, optional): Milliseconds between checks if `onDeferredEventDue` is used. **Default:** `10000`.

### `tracker.trackEvent(category, id, details)`

* Tracks an event and returns its outcome.
* **Returns:** `Promise<{ type, data }>` where `type` is `'immediate'`, `'deferred'`, or `'ignored'`, and `data` is the event record.

### `tracker.processDeferredEvents()`

* Manually fetches and clears all currently due events.
* **Returns:** `Promise<EventRecord[]>`

### `tracker.getDeferredEvents()`

* Fetches a snapshot of all deferred events without clearing them.
* **Returns:** `Promise<EventRecord[]>`

### `tracker.updateConfig(category, id, newConfig)`

* Updates the configuration for a specific event stream at runtime.
* **Returns:** `Promise<boolean>` indicating if the record was found and updated.

### `tracker.destroy()`

* Clears all background timers. Call this for a graceful shutdown.

-----

## \#\# Events 📢

The tracker is an `EventEmitter`. You can listen for events to add logging, metrics, or custom logic.

* **`tracker.on('tracked', (record) => {})`**: Fired every time an event is successfully tracked.
* **`tracker.on('immediate', (record) => {})`**: Fired when an event is allowed to proceed immediately.
* **`tracker.on('deferred', (record) => {})`**: Fired when an event exceeds its limit and is deferred for the first time.
* **`tracker.on('ignored', (info) => {})`**: Fired when an event is ignored (`info.reason` will be `'already_deferred'` or `'key_limit_reached'`).
* **`tracker.on('processed', (record) => {})`**: Fired for each event cleared via `processDeferredEvents`.
* **`tracker.on('config_updated', (record) => {})`**: Fired after `updateConfig` successfully modifies a record.
* **`tracker.on('error', (error) => {})`**: Fired if the background processor encounters an error.

-----

## \#\# License 📜

This project is licensed under the ISC License.