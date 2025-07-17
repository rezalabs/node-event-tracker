const BaseStrategy = require('./BaseStrategy')

/**
 * @typedef {import('../index.js').EventRecord} EventRecord
 * @typedef {import('../index.js').EventTracker} EventTracker
 */

const DEFAULT_BUCKET_SIZE = 10
const DEFAULT_REFILL_RATE = 1 // tokens per second

/**
 * A token bucket throttling strategy.
 * Allows for bursts of events and refills tokens at a constant rate.
 */
class TokenBucketStrategy extends BaseStrategy {
  /**
     * @param {EventTracker} tracker - The parent EventTracker instance.
     * @param {object} [options={}]
     * @param {number} [options.bucketSize=10] - The maximum number of tokens the bucket can hold.
     * @param {number} [options.refillRate=1] - The number of tokens to add per second.
     */
  constructor (tracker, options = {}) {
    super(tracker)
    this.bucketSize = options.bucketSize ?? DEFAULT_BUCKET_SIZE
    this.refillRate = options.refillRate ?? DEFAULT_REFILL_RATE
  }

  /**
     * @override
     */
  async track (record, eventData) {
    const { compositeKey, category, id, details, detailsHash } = eventData
    const now = Date.now()
    let updatedRecord = record

    if (!updatedRecord) {
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
        config: { // Strategy-specific config
          bucketSize: this.bucketSize,
          refillRate: this.refillRate,
          deferInterval: this.tracker.deferInterval
        },
        strategyData: { // Strategy-specific state
          tokens: this.bucketSize - 1,
          lastRefill: now
        }
      }
      return { outcome: 'immediate', record: updatedRecord }
    }

    // Refill the bucket
    const { tokens, lastRefill } = updatedRecord.strategyData
    const config = updatedRecord.config
    const elapsedSeconds = (now - lastRefill) / 1000
    const tokensToAdd = Math.floor(elapsedSeconds * config.refillRate)

    let currentTokens = tokens
    if (tokensToAdd > 0) {
      currentTokens = Math.min(config.bucketSize, tokens + tokensToAdd)
      updatedRecord.strategyData.lastRefill = now
    }

    if (currentTokens >= 1) {
      updatedRecord.strategyData.tokens = currentTokens - 1
      updatedRecord.count += 1 // Still useful for analytics
      updatedRecord.lastEventTime = now
      updatedRecord.expiresAt = now + this.tracker.expireTime
      updatedRecord.deferred = false // A successful event makes it not deferred
      updatedRecord.scheduledSendAt = null
      return { outcome: 'immediate', record: updatedRecord }
    } else {
      updatedRecord.deferred = true
      // Schedule retry when we expect the next token to be available
      const secondsPerToken = 1 / config.refillRate
      updatedRecord.scheduledSendAt = now + (secondsPerToken * 1000)
      return { outcome: 'deferred', record: updatedRecord }
    }
  }
}

module.exports = TokenBucketStrategy
