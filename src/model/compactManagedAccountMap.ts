import type { AccountV2025 as Account } from 'sailpoint-api-client'

const DEFAULT_IN_HEAP_LIMIT = 10_000
const DEFAULT_SLAB_BYTES = 4 * 1024 * 1024
const OFFSET_RADIX = 0x100000000

export interface CompactManagedAccountMapOptions {
    /** Number of entries kept as live JS objects before spilling to off-heap Buffer slabs. */
    inHeapLimit?: number
    /** Size in bytes of each off-heap Buffer slab (default 4 MiB). */
    slabBytes?: number
}

/**
 * `Map<string, Account>` that keeps up to `inHeapLimit` entries as normal V8 objects
 * (preserving object identity for small runs and unit tests) and spills additional
 * entries into off-V8-heap `Buffer` slabs as length-prefixed UTF-8 JSON records.
 *
 * For massive aggregations (e.g. 1.35M+ managed accounts), keeping the bulk of account
 * bodies in `Buffer` slabs removes millions of JS objects and property pointers from V8's
 * Mark-Compact heap graph, cutting both RSS and GC pressure dramatically.
 */
export class CompactManagedAccountMap extends Map<string, Account> {
    private readonly inHeapLimit: number
    private readonly slabBytes: number
    private readonly slabIndex = new Map<string, number>()
    private slabs: Buffer[] = []
    private currentSlab: Buffer | undefined
    private currentOffset = 0

    constructor(options: CompactManagedAccountMapOptions = {}) {
        super()
        this.inHeapLimit = options.inHeapLimit ?? DEFAULT_IN_HEAP_LIMIT
        this.slabBytes = options.slabBytes ?? DEFAULT_SLAB_BYTES
    }

    override get size(): number {
        return super.size + this.slabIndex.size
    }

    override has(key: string): boolean {
        return super.has(key) || this.slabIndex.has(key)
    }

    override get(key: string): Account | undefined {
        const inHeap = super.get(key)
        if (inHeap !== undefined) return inHeap
        const handle = this.slabIndex.get(key)
        if (handle === undefined) return undefined
        return this.readFromSlab(handle)
    }

    override set(key: string, value: Account): this {
        if (this.slabIndex.has(key)) {
            this.slabIndex.set(key, this.writeToSlab(value))
            return this
        }
        if (super.has(key) || super.size < this.inHeapLimit) {
            super.set(key, value)
            return this
        }
        this.slabIndex.set(key, this.writeToSlab(value))
        return this
    }

    override delete(key: string): boolean {
        const deletedInHeap = super.delete(key)
        const deletedInSlab = this.slabIndex.delete(key)
        if (this.slabIndex.size === 0 && this.slabs.length > 0) {
            this.releaseSlabs()
        }
        return deletedInHeap || deletedInSlab
    }

    override clear(): void {
        super.clear()
        this.slabIndex.clear()
        this.releaseSlabs()
    }

    override *keys(): IterableIterator<string> {
        yield* super.keys()
        yield* this.slabIndex.keys()
    }

    override *values(): IterableIterator<Account> {
        yield* super.values()
        for (const handle of this.slabIndex.values()) {
            yield this.readFromSlab(handle)
        }
    }

    override *entries(): IterableIterator<[string, Account]> {
        yield* super.entries()
        for (const [key, handle] of this.slabIndex.entries()) {
            yield [key, this.readFromSlab(handle)]
        }
    }

    override [Symbol.iterator](): IterableIterator<[string, Account]> {
        return this.entries()
    }

    override forEach(
        callbackfn: (value: Account, key: string, map: Map<string, Account>) => void,
        thisArg?: unknown
    ): void {
        for (const [key, value] of this.entries()) {
            callbackfn.call(thisArg, value, key, this)
        }
    }

    private releaseSlabs(): void {
        this.slabs = []
        this.currentSlab = undefined
        this.currentOffset = 0
    }

    private writeToSlab(account: Account): number {
        const json = JSON.stringify(account)
        const byteLength = Buffer.byteLength(json, 'utf8')
        const recordBytes = 4 + byteLength

        if (!this.currentSlab || this.currentOffset + recordBytes > this.currentSlab.length) {
            const nextSlab = Buffer.allocUnsafe(Math.max(this.slabBytes, recordBytes))
            this.slabs.push(nextSlab)
            this.currentSlab = nextSlab
            this.currentOffset = 0
        }

        const slabIdx = this.slabs.length - 1
        const offset = this.currentOffset
        this.currentSlab.writeUInt32LE(byteLength, offset)
        this.currentSlab.write(json, offset + 4, byteLength, 'utf8')
        this.currentOffset += recordBytes

        return slabIdx * OFFSET_RADIX + offset
    }

    private readFromSlab(handle: number): Account {
        const slabIdx = Math.floor(handle / OFFSET_RADIX)
        const offset = handle - slabIdx * OFFSET_RADIX
        const slab = this.slabs[slabIdx]
        const byteLength = slab.readUInt32LE(offset)
        const json = slab.toString('utf8', offset + 4, offset + 4 + byteLength)
        return JSON.parse(json) as Account
    }
}
