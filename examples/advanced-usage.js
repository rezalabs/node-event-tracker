const EventTracker = require('../index')

const { TokenBucketStrategy } = EventTracker

async function run () {
  console.log('--- Phase 3: Advanced Features ---')

  // 1. Setup a processor callback
  const processor = async (events) => {
    console.log(`\n[PROCESSOR CALLBACK] Received ${events.length} due event(s).`)
    events.forEach(e => {
      console.log(` -> Processing ${e.category}/${e.id} which occurred ${e.count} times.`)
    })
  }

  // 2. Instantiate with TokenBucketStrategy and the callback
  const tracker = new EventTracker({
    strategy: new TokenBucketStrategy(this, {
      bucketSize: 5, // Allow 5 events in a burst
      refillRate: 0.5 // Refill 0.5 tokens per second (1 every 2s)
    }),
    onDeferredEventDue: processor,
    processingInterval: 2000 // Check for due events every 2 seconds
  })

  tracker.on('error', (err) => console.error('Tracker error:', err))

  console.log('\n--- Simulating event burst with Token Bucket ---')
  const details = { error: 'E_CONN_RESET' }
  for (let i = 0; i < 7; i++) {
    const res = await tracker.trackEvent('network', 'service-A', details)
    console.log(`[Attempt ${i + 1}] Outcome: ${res.type}`)
    await new Promise(r => setTimeout(r, 200)) // 200ms between events
  }

  console.log('\n--- Using Dynamic Configuration ---')
  console.log('Updating limit for `service-B` to 10...')
  // This won't affect service-A. Note: This config is for the default strategy,
  // but we demonstrate setting it. It would be used if we had a SimpleCounterStrategy.
  await tracker.updateConfig('network', 'service-B', { limit: 10 })
  console.log('Config for service-B updated.')

  console.log('\n--- Waiting for events to be processed by the callback ---')
  // We just wait, the interval processor will handle the rest.
  await new Promise(r => setTimeout(r, 5000))

  console.log('\n--- Shutting down ---')
  tracker.destroy()
}

run()
