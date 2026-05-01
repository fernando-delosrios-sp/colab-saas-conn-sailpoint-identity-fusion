const NUM_ITEMS = 50000
const DUPLICATES = 5

function benchmarkArray() {
    let formsToDelete: string[] = []
    const start = performance.now()
    for (let i = 0; i < NUM_ITEMS; i++) {
        for (let j = 0; j < DUPLICATES; j++) {
            const id = `form-${i}`
            if (!formsToDelete.includes(id)) {
                formsToDelete.push(id)
            }
        }
    }

    if (formsToDelete.length === 0) return
    const formIdsToQueue = [...new Set(formsToDelete)]
    formsToDelete = []

    const end = performance.now()
    console.log(`Array implementation: ${end - start} ms`)
}

function benchmarkSet() {
    let formsToDelete: Set<string> = new Set()
    const start = performance.now()
    for (let i = 0; i < NUM_ITEMS; i++) {
        for (let j = 0; j < DUPLICATES; j++) {
            const id = `form-${i}`
            formsToDelete.add(id)
        }
    }

    if (formsToDelete.size === 0) return
    const formIdsToQueue = Array.from(formsToDelete)
    formsToDelete = new Set()

    const end = performance.now()
    console.log(`Set implementation: ${end - start} ms`)
}

benchmarkArray()
benchmarkSet()
