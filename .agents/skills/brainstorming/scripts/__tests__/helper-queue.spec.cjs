const assert = require('node:assert/strict')
const { drainEventQueueSnapshot, nextReconnectDelay } = require('../helper.js')

function drainLikeBrowser(initial, trySend, enqueueDuringSend) {
    let eventQueue = initial.slice()
    while (eventQueue.length > 0) {
        const batch = eventQueue
        eventQueue = []
        let sentAny = false
        for (const item of batch) {
            enqueueDuringSend(item, eventQueue)
            if (trySend(item)) {
                sentAny = true
            } else {
                eventQueue.push(item)
            }
        }
        if (!sentAny) {
            return eventQueue
        }
    }
    return eventQueue
}

{
    const sent = []
    drainLikeBrowser(['a', 'b'], (item) => {
        sent.push(item)
        return true
    }, (item, liveQueue) => {
        if (item === 'a') {
            liveQueue.push('c')
        }
    })

    assert.deepEqual(sent, ['a', 'b', 'c'])
}

{
    const remaining = drainEventQueueSnapshot(['a', 'b', 'c'], (item) => item !== 'b')

    assert.deepEqual(remaining, ['b'])
}

{
    const queue = ['a']
    const sent = []

    queue.forEach((item) => {
        sent.push(item)
    })
    queue.push('b')
    queue.length = 0

    assert.deepEqual(sent, ['a'])
    assert.deepEqual(queue, [])
}

assert.equal(nextReconnectDelay(500, 30000), 1000)
assert.equal(nextReconnectDelay(20000, 30000), 30000)

console.log('helper.js queue drain tests passed')

