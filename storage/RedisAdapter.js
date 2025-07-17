/**
 * @typedef {import('../index.js').EventRecord} EventRecord
 */

const KEY_PREFIX = 'event-tracker:'
const DEFERRED_SET_KEY = `${KEY_PREFIX}deferred-set`

/**
 * An adapter for storing event records in Redis.
 *
 * This adapter leverages Redis's atomic operations and data structures
 * for high performance and scalability in a distributed environment.
 */
class RedisAdapter {
  /**
     * @param {object} options - Configuration options.
     * @param {object} options.redisClient - A connected node-redis v4 client instance.
     */
  constructor (options) {
    if (!options || !options.redisClient) {
      throw new Error('A connected redis client instance must be provided.')
    }
    this.redis = options.redisClient
  }

  /**
     * Generates the Redis key for an event record.
     * @param {string} key - The composite key of the event.
     * @returns {string} The full Redis key.
     */
  _getRecordKey (key) {
    return `${KEY_PREFIX}${key}`
  }

  /**
     * Retrieves a record from Redis.
     * @param {string} key - The composite key of the event.
     * @returns {Promise<EventRecord|undefined>} The event record if found.
     */
  async get (key) {
    const recordKey = this._getRecordKey(key)
    const data = await this.redis.hGetAll(recordKey)
    if (!Object.keys(data).length) return undefined

    // Convert string representations back to correct types
    return {
      key: data.key,
      category: data.category,
      id: data.id,
      details: JSON.parse(data.details),
      detailsHash: data.detailsHash,
      count: parseInt(data.count, 10),
      lastEventTime: parseInt(data.lastEventTime, 10),
      expiresAt: parseInt(data.expiresAt, 10),
      deferred: data.deferred === 'true',
      scheduledSendAt: data.scheduledSendAt ? parseInt(data.scheduledSendAt, 10) : null
    }
  }

  /**
     * Stores or updates a record in Redis.
     * @param {string} key - The composite key of the event.
     * @param {EventRecord} record - The event record to store.
     * @returns {Promise<void>}
     */
  async set (key, record) {
    const recordKey = this._getRecordKey(key)
    const flatRecord = {
      ...record,
      details: JSON.stringify(record.details),
      deferred: record.deferred.toString()
    }

    const transaction = this.redis.multi()
      .hSet(recordKey, Object.entries(flatRecord).flat())
      .expireAt(recordKey, Math.ceil(record.expiresAt / 1000)) // EXPIREAT wants seconds

    if (record.deferred && record.scheduledSendAt) {
      transaction.zAdd(DEFERRED_SET_KEY, {
        score: record.scheduledSendAt,
        value: record.key
      })
    } else {
      transaction.zRem(DEFERRED_SET_KEY, record.key)
    }

    await transaction.exec()
  }

  /**
     * Deletes a record from Redis.
     * @param {string} key - The composite key of the event.
     * @returns {Promise<void>}
     */
  async delete (key) {
    await this.redis.multi()
      .del(this._getRecordKey(key))
      .zRem(DEFERRED_SET_KEY, key)
      .exec()
  }

  /**
     * Returns the approximate number of records in the store.
     * @returns {Promise<number>}
     */
  async size () {
    const stream = this.redis.scanIterator({ MATCH: `${KEY_PREFIX}*`, COUNT: 100 })
    let count = 0
    // eslint-disable-next-line no-unused-vars
    for await (const key of stream) {
      count++
    }
    // Subtract the deferred set key if it exists
    const deferredSetExists = await this.redis.exists(DEFERRED_SET_KEY)
    return deferredSetExists ? count - 1 : count
  }

  /**
     * Finds all records that are deferred and due for processing.
     * @param {number} timestamp - The current timestamp to check against.
     * @returns {Promise<EventRecord[]>} A list of due event records.
     */
  async findDueDeferred (timestamp) {
    const dueKeys = await this.redis.zRangeByScore(DEFERRED_SET_KEY, 0, timestamp)
    if (!dueKeys.length) return []
    const records = await Promise.all(dueKeys.map(key => this.get(key)))
    return records.filter(r => r) // Filter out any nulls from race conditions
  }

  /**
     * Finds all deferred records, regardless of whether they are due.
     * @returns {Promise<EventRecord[]>} A list of all deferred event records.
     */
  async findAllDeferred () {
    const allDeferredKeys = await this.redis.zRange(DEFERRED_SET_KEY, 0, -1)
    if (!allDeferredKeys.length) return []
    const records = await Promise.all(allDeferredKeys.map(key => this.get(key)))
    return records.filter(r => r)
  }

  /**
     * Cleans up resources. For this adapter, it's a no-op as the
     * consumer is responsible for managing the Redis client connection.
     */
  destroy () {
    // Client connection is managed externally
  }
}

module.exports = RedisAdapter
