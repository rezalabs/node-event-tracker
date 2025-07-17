/**
 * @typedef {import('../index.js').EventRecord} EventRecord
 */

const DEFAULT_PURGE_INTERVAL_MS = 60 * 1000 // 1 minute

/**
 * An in-memory storage adapter for the EventTracker.
 *
 * Implements the StorageAdapter interface for storing event records in memory.
 * This adapter is suitable for single-process applications where data persistence
 * is not required. It features a periodic cleanup mechanism to purge expired records.
 */
class InMemoryAdapter {
  /**
     * @param {object} [options] - Configuration options.
     * @param {number} [options.purgeInterval=60000] - How often (in ms) to check for and remove expired records.
     */
  constructor (options = {}) {
    this.events = new Map()
    const purgeInterval = options.purgeInterval ?? DEFAULT_PURGE_INTERVAL_MS

    if (purgeInterval > 0) {
      this.purgeIntervalId = setInterval(() => {
        this.purgeExpired()
      }, purgeInterval)
    }
  }

  /**
     * Purges expired event records from the store.
     * This is called periodically and is designed to be a background task.
     */
  purgeExpired () {
    const now = Date.now()
    for (const [key, record] of this.events.entries()) {
      // The main engine handles the expiration time logic.
      // This check is a safeguard for any records that might be missed.
      if (now > record.expiresAt) {
        this.events.delete(key)
      }
    }
  }

  /**
     * Retrieves a record by its key.
     * @param {string} key - The composite key of the event.
     * @returns {Promise<EventRecord|undefined>} The event record if found.
     */
  async get (key) {
    return this.events.get(key)
  }

  /**
     * Stores or updates a record.
     * @param {string} key - The composite key of the event.
     * @param {EventRecord} record - The event record to store.
     * @returns {Promise<void>}
     */
  async set (key, record) {
    this.events.set(key, record)
  }

  /**
     * Deletes a record by its key.
     * @param {string} key - The composite key of the event.
     * @returns {Promise<void>}
     */
  async delete (key) {
    this.events.delete(key)
  }

  /**
     * Returns the number of records in the store.
     * @returns {Promise<number>} The total number of unique event keys.
     */
  async size () {
    return this.events.size
  }

  /**
     * Finds all records that are deferred and due for processing.
     * @param {number} timestamp - The current timestamp to check against.
     * @returns {Promise<EventRecord[]>} A list of due event records.
     */
  async findDueDeferred (timestamp) {
    const due = []
    for (const record of this.events.values()) {
      if (record.deferred && record.scheduledSendAt && timestamp >= record.scheduledSendAt) {
        due.push(record)
      }
    }
    return due
  }

  /**
     * Cleans up resources, like the purge interval timer.
     * Should be called when the tracker is no longer needed.
     */
  destroy () {
    if (this.purgeIntervalId) {
      clearInterval(this.purgeIntervalId)
    }
  }
}

module.exports = InMemoryAdapter
