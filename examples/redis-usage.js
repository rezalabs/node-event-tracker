const { createClient } = require('redis')
const EventTracker = require('../index')
const RedisAdapter = require('../storage/RedisAdapter')

async function run () {
  // Connect to a local Redis instance
  const redisClient = createClient({
    // Use a separate database for the example to avoid key clashes
    database: 1
  })
  await redisClient.connect()
  // Clear the database for a clean run
  await redisClient.flushDb()

  const tracker = new EventTracker({
    storage: new RedisAdapter({ redisClient }),
    limit: 3,
    deferInterval: 2000 // 2 seconds for quick demonstration
  })

  // Set up listeners for observability
  tracker.on('immediate', (record) => console.log(`[EVENT] Immediate: ${record.category}/${record.id} (Count: ${record.count})`))
  tracker.on('deferred', (record) => console.log(`[EVENT] Deferred: ${record.category}/${record.id}`))
  tracker.on('processed', (record) => console.log(`[EVENT] Processed: ${record.category}/${record.id}`))
  tracker.on('ignored', (info) => console.log(`[EVENT] Ignored: ${info.reason}`))

  console.log('--- Simulating traffic with Redis backend ---')
  const details = { source: 'app-instance-1' }

  await tracker.trackEvent('api_error', 'db_connection_fail', details)
  await tracker.trackEvent('api_error', 'db_connection_fail', details)
  await tracker.trackEvent('api_error', 'db_connection_fail', details)
  // This one will be deferred
  await tracker.trackEvent('api_error', 'db_connection_fail', details)

  console.log('\nAnother instance can now share the same state.')
  const tracker2 = new EventTracker({ storage: new RedisAdapter({ redisClient }), limit: 3 })
  const result = await tracker2.trackEvent('api_error', 'db_connection_fail', details)
  console.log('Result from second tracker instance:', result.type) // Will be 'ignored'

  const deferred = await tracker.getDeferredEvents()
  console.log(`\nFound ${deferred.length} deferred event(s) before processing.`)

  console.log('\n--- Waiting for deferral period to pass (3 seconds) ---')
  await new Promise(resolve => setTimeout(resolve, 3000))

  const dueEvents = await tracker.processDeferredEvents()
  console.log(`\nProcessed ${dueEvents.length} due event(s).`)

  const deferredAfter = await tracker.getDeferredEvents()
  console.log(`\nFound ${deferredAfter.length} deferred event(s) after processing.`)

  // Clean up
  await redisClient.quit()
  tracker.destroy()
}

run()
