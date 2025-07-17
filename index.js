const crypto = require('crypto')
const EventEmitter = require('events')
const InMemoryAdapter = require('./storage/InMemoryAdapter')
const RedisAdapter = require('./storage/RedisAdapter')
const SimpleCounterStrategy = require('./strategies/SimpleCounterStrategy')
const TokenBucketStrategy = require('./strategies/TokenBucketStrategy')

const DEFAULT_LIMIT = 5
const DEFAULT_DEFER_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const DEFAULT_EXPIRE_TIME_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * @typedef {object} EventRecord
 * @property {string} key - Hashed composite key.
 * @property {string} category - High-level grouping of the event.
 * @property {string} id - Specific identifier within the category.
 * @property {object} details - The original event details object.
 * @property {string} detailsHash - SHA256 hash of the sorted event details.
 * @property {number} count - Current count of this event in the window.
 * @property {number} lastEventTime - Timestamp of the last recorded event.
 * @property {number} expiresAt - Timestamp when this record is considered expired.
 * @property {boolean} deferred - True if the event is deferred.
 * @property {number|null} scheduledSendAt - Timestamp for next processing attempt.
 * @property {object} config - A snapshot of the tracker/strategy config for this record.
 * @property {object} [strategyData] - State used by the throttling strategy (e.g., token count).
 */
class EventTracker extends EventEmitter {
  /**
     * @param {object} [options={}] - Configuration options.
     * @param {number} [options.limit=5] - Max events before deferring (for SimpleCounterStrategy).
     * @param {number} [options.deferInterval] - Time (ms) to wait before reprocessing.
     * @param {number} [options.expireTime] - Time (ms) after which a record is stale.
     * @param {number} [options.maxKeys=0] - Max number of unique keys to track (0 for unlimited).
     * @param {object} [options.storage] - A storage adapter instance. Defaults to InMemoryAdapter.
     * @param {BaseStrategy} [options.strategy] - A throttling strategy instance. Defaults to SimpleCounterStrategy.
     * @param {function(EventRecord[]): Promise<void>} [options.onDeferredEventDue] - Async callback for processing due events.
     * @param {number} [options.processingInterval=10000] - How often (ms) to check for due events if a callback is used.
     */
  constructor (options = {}) {
    super()
    this.limit = options.limit ?? DEFAULT_LIMIT
    this.deferInterval = options.deferInterval ?? DEFAULT_DEFER_INTERVAL_MS
    this.expireTime = options.expireTime ?? DEFAULT_EXPIRE_TIME_MS
    this.maxKeys = options.maxKeys ?? 0
    this.storage = options.storage ?? new InMemoryAdapter()
    this.strategy = options.strategy ?? new SimpleCounterStrategy(this)

    this.onDeferredEventDue = options.onDeferredEventDue
    this.processingIntervalMs = options.processingInterval ?? 10000
    this.processingIntervalId = null

    if (typeof this.onDeferredEventDue === 'function') {
      this.startProcessor()
    }
  }

  startProcessor () {
    if (this.processingIntervalId) return
    this.processingIntervalId = setInterval(async () => {
      try {
        const dueEvents = await this.processDeferredEvents()
        if (dueEvents.length > 0) {
          await this.onDeferredEventDue(dueEvents)
        }
      } catch (error) {
        this.emit('error', error)
      }
    }, this.processingIntervalMs)
  }

  static generateDetailsHash (details) {
    if (!details || typeof details !== 'object') return ''
    const sortedKeys = Object.keys(details).sort()
    const detailsString = JSON.stringify(details, sortedKeys)
    return crypto.createHash('sha256').update(detailsString).digest('hex')
  }

  static generateCompositeKey (category, id) {
    const composite = `${category}:${id}`
    return crypto.createHash('sha256').update(composite).digest('hex')
  }

  async trackEvent (category, id, details) {
    const compositeKey = EventTracker.generateCompositeKey(category, id)
    const detailsHash = EventTracker.generateDetailsHash(details)
    const now = Date.now()
    let record = await this.storage.get(compositeKey)

    const isExpired = record && now > record.expiresAt
    const detailsChanged = record && record.detailsHash !== detailsHash

    if (isExpired || detailsChanged) {
      record = undefined // Treat as a new event
    }

    if (!record && this.maxKeys > 0 && await this.storage.size() >= this.maxKeys) {
      this.emit('ignored', { reason: 'key_limit_reached', category, id, details })
      return { type: 'ignored', reason: 'key_limit_reached' }
    }

    const eventData = { compositeKey, category, id, details, detailsHash }
    const { outcome, record: updatedRecord } = await this.strategy.track(record, eventData)

    await this.storage.set(compositeKey, updatedRecord)
    this.emit('tracked', updatedRecord)
    this.emit(outcome, updatedRecord)

    return { type: outcome, data: updatedRecord }
  }

  async processDeferredEvents () {
    const now = Date.now()
    const dueEvents = await this.storage.findDueDeferred(now)
    for (const event of dueEvents) {
      await this.storage.delete(event.key)
      this.emit('processed', event)
    }
    return dueEvents
  }

  /**
     * Updates the configuration for a specific event stream at runtime.
     * This modifies the stored record, affecting subsequent throttling decisions for it.
     * @param {string} category
     * @param {string} id
     * @param {object} newConfig - The configuration fields to update.
     * @returns {Promise<boolean>} - True if the record was found and updated.
     */
  async updateConfig (category, id, newConfig) {
    const compositeKey = EventTracker.generateCompositeKey(category, id)
    const record = await this.storage.get(compositeKey)
    if (!record) return false

    record.config = { ...record.config, ...newConfig }
    await this.storage.set(compositeKey, record)
    this.emit('config_updated', record)
    return true
  }

  async getDeferredEvents () {
    if (typeof this.storage.findAllDeferred === 'function') {
      return this.storage.findAllDeferred()
    }
    const now = Date.now() + this.deferInterval * 365
    return this.storage.findDueDeferred(now)
  }

  destroy () {
    if (this.processingIntervalId) {
      clearInterval(this.processingIntervalId)
    }
    if (this.storage && typeof this.storage.destroy === 'function') {
      this.storage.destroy()
    }
    this.removeAllListeners()
  }
}

module.exports = EventTracker
module.exports.InMemoryAdapter = InMemoryAdapter
module.exports.RedisAdapter = RedisAdapter
module.exports.SimpleCounterStrategy = SimpleCounterStrategy
module.exports.TokenBucketStrategy = TokenBucketStrategy
