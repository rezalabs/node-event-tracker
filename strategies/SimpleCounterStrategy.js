const BaseStrategy = require('./BaseStrategy')

/**
 * @typedef {import('../index.js').EventRecord} EventRecord
 */

/**
 * A simple counter-based strategy.
 *
 * This strategy tracks the count of identical events and defers them
 * once a configured limit is exceeded within the expiration window.
 */
class SimpleCounterStrategy extends BaseStrategy {
  /**
     * @override
     */
  async track (record, eventData) {
    const { compositeKey, category, id, details, detailsHash } = eventData
    const now = Date.now()
    let updatedRecord = record

    if (!updatedRecord) {
      // Create a new record with the tracker's current configuration
      updatedRecord = {
        key: compositeKey,
        category,
        id,
        details,
        detailsHash,
        count: 1,
        lastEventTime: now,
        expiresAt: now + this.tracker.expireTime,
        deferred: false,
        scheduledSendAt: null,
        config: { // Snapshot of the config at creation time
          limit: this.tracker.limit,
          deferInterval: this.tracker.deferInterval
        }
      }
    } else {
      updatedRecord.count += 1
      updatedRecord.lastEventTime = now
      updatedRecord.expiresAt = now + this.tracker.expireTime
    }

    if (updatedRecord.deferred) {
      return { outcome: 'ignored', record: updatedRecord }
    }

    // Use the limit from the record's config
    if (updatedRecord.count > updatedRecord.config.limit) {
      updatedRecord.deferred = true
      updatedRecord.scheduledSendAt = now + updatedRecord.config.deferInterval
      return { outcome: 'deferred', record: updatedRecord }
    }

    return { outcome: 'immediate', record: updatedRecord }
  }
}

module.exports = SimpleCounterStrategy
