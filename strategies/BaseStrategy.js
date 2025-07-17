/**
 * @typedef {import('../index.js').EventRecord} EventRecord
 * @typedef {import('../index.js').EventTracker} EventTracker
 */

/**
 * Base class for all throttling strategies.
 * Defines the interface that the EventTracker engine uses to make throttling decisions.
 */
class BaseStrategy {
  /**
     * @param {EventTracker} tracker - The parent EventTracker instance.
     */
  constructor (tracker) {
    this.tracker = tracker
  }

  /**
     * Processes an event and determines the outcome based on the strategy's rules.
     * This method must be implemented by all subclasses.
     * @param {EventRecord | undefined} record - The existing record, or undefined if new.
     * @param {object} eventData - The raw data for the incoming event.
     * @returns {Promise<{outcome: 'immediate'|'deferred'|'ignored', record: EventRecord}>}
     */
  async track (record, eventData) {
    throw new Error('Strategy.track() must be implemented by subclasses.')
  }
}

module.exports = BaseStrategy
