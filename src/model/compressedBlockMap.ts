import { deflateRawSync, inflateRawSync } from 'node:zlib'

const DEFAULT_IN_HEAP_LIMIT = 10_000
const DEFAULT_BLOCK_SIZE = 128
const DEFAULT_LRU_CAPACITY = 16
const COMPOSITE_KEY_SEPARATOR = '::'

export interface CompressedBlockMapOptions {
    /** Number of entries kept as live JS objects before spilling to compressed blocks (default 10,000). */
    inHeapLimit?: number
    /** Number of records grouped into each DEFLATE-compressed block (default 128). */
    blockSize?: number
    /** Maximum number of decompressed blocks retained in the read LRU cache (default 16). */
    lruCapacity?: number
    /** Split `<sourceId>::<nativeIdentity>` keys into two-level partitions to avoid prefix duplication. */
    partitionCompositeKeys?: boolean
}

/**
 * `Map<string, V>` that keeps up to `inHeapLimit` entries as live V8 objects (preserving
 * object identity for small runs and unit tests) and spills additional entries into
 * raw-DEFLATE compressed JSON blocks in memory, served through a bounded LRU read cache.
 *
 * Per-block live slot counts (`blockLiveCounts`) track remaining live entries in each
 * block so that when every key in a sealed block is deleted or overwritten, that block's
 * compressed `Buffer` is immediately replaced with an empty `Buffer` and evicted from
 * `lruCache` without waiting for the entire map to empty.
 *
 * When `partitionCompositeKeys` is enabled, `<sourceId>::<nativeIdentity>` keys are indexed
 * in a two-level `sourceId -> nativeIdentity -> slot` map so the repeated source prefix is
 * not duplicated across millions of entries.
 */
export class CompressedBlockMap<V> extends Map<string, V> {
    private readonly inHeapLimit: number
    private readonly blockSize: number
    private readonly lruCapacity: number
    private readonly partitionCompositeKeys: boolean

    private readonly flatIndex = new Map<string, number>()
    private readonly partitions = new Map<string, Map<string, number>>()
    private partitionedCount = 0

    private sealedBlocks: Buffer[] = []
    private blockLiveCounts: number[] = []
    private pending: V[] = []
    private readonly lruCache = new Map<number, V[]>()

    constructor(options: CompressedBlockMapOptions = {}) {
        super()
        this.inHeapLimit = options.inHeapLimit ?? DEFAULT_IN_HEAP_LIMIT
        this.blockSize = Math.max(1, options.blockSize ?? DEFAULT_BLOCK_SIZE)
        this.lruCapacity = Math.max(0, options.lruCapacity ?? DEFAULT_LRU_CAPACITY)
        this.partitionCompositeKeys = options.partitionCompositeKeys ?? false
    }

    override get size(): number {
        return super.size + this.compressedCount
    }

    /** Number of sealed DEFLATE-compressed blocks currently held in memory. */
    get sealedBlockCount(): number {
        return this.sealedBlocks.length
    }

    /** Number of decompressed blocks currently held in the LRU read cache. */
    get cacheSize(): number {
        return this.lruCache.size
    }

    /** Read-only view of internal source partitions (for diagnostics and testing). */
    get internalPartitions(): ReadonlyMap<string, ReadonlyMap<string, number>> {
        return this.partitions
    }

    override has(key: string): boolean {
        if (super.has(key)) return true
        return this.getSlot(key) !== undefined
    }

    override get(key: string): V | undefined {
        const inHeap = super.get(key)
        if (inHeap !== undefined || super.has(key)) return inHeap
        const slot = this.getSlot(key)
        if (slot === undefined) return undefined
        return this.readSlot(slot)
    }

    override set(key: string, value: V): this {
        const existingSlot = this.getSlot(key)
        if (existingSlot !== undefined) {
            const newSlot = this.appendRecord(value)
            this.setSlot(key, newSlot)
            this.releaseSlot(existingSlot)
            return this
        }
        if (super.has(key) || super.size < this.inHeapLimit) {
            super.set(key, value)
            return this
        }
        this.setSlot(key, this.appendRecord(value))
        return this
    }

    override delete(key: string): boolean {
        const deletedInHeap = super.delete(key)
        const deletedCompressed = this.deleteSlot(key)
        if (this.compressedCount === 0 && (this.sealedBlocks.length > 0 || this.pending.length > 0)) {
            this.releaseCompressedStorage()
        }
        return deletedInHeap || deletedCompressed
    }

    override clear(): void {
        super.clear()
        this.flatIndex.clear()
        this.partitions.clear()
        this.partitionedCount = 0
        this.releaseCompressedStorage()
    }

    override *keys(): IterableIterator<string> {
        yield* super.keys()
        if (!this.partitionCompositeKeys) {
            yield* this.flatIndex.keys()
            return
        }
        for (const [sourceId, inner] of this.partitions.entries()) {
            for (const nativeIdentity of inner.keys()) {
                yield joinKey(sourceId, nativeIdentity)
            }
        }
    }

    override *values(): IterableIterator<V> {
        yield* super.values()
        if (!this.partitionCompositeKeys) {
            for (const slot of this.flatIndex.values()) {
                yield this.readSlot(slot)
            }
            return
        }
        for (const inner of this.partitions.values()) {
            for (const slot of inner.values()) {
                yield this.readSlot(slot)
            }
        }
    }

    override *entries(): IterableIterator<[string, V]> {
        yield* super.entries()
        if (!this.partitionCompositeKeys) {
            for (const [key, slot] of this.flatIndex.entries()) {
                yield [key, this.readSlot(slot)]
            }
            return
        }
        for (const [sourceId, inner] of this.partitions.entries()) {
            for (const [nativeIdentity, slot] of inner.entries()) {
                yield [joinKey(sourceId, nativeIdentity), this.readSlot(slot)]
            }
        }
    }

    override [Symbol.iterator](): IterableIterator<[string, V]> {
        return this.entries()
    }

    override forEach(callbackfn: (value: V, key: string, map: Map<string, V>) => void, thisArg?: unknown): void {
        for (const [key, value] of this.entries()) {
            callbackfn.call(thisArg, value, key, this)
        }
    }

    private get compressedCount(): number {
        return this.partitionCompositeKeys ? this.partitionedCount : this.flatIndex.size
    }

    private getSlot(key: string): number | undefined {
        if (!this.partitionCompositeKeys) {
            return this.flatIndex.get(key)
        }
        const [sourceId, nativeIdentity] = splitKey(key)
        return this.partitions.get(sourceId)?.get(nativeIdentity)
    }

    private setSlot(key: string, slot: number): void {
        if (!this.partitionCompositeKeys) {
            this.flatIndex.set(key, slot)
            return
        }
        const [sourceId, nativeIdentity] = splitKey(key)
        let inner = this.partitions.get(sourceId)
        if (!inner) {
            inner = new Map<string, number>()
            this.partitions.set(sourceId, inner)
        }
        if (!inner.has(nativeIdentity)) {
            this.partitionedCount++
        }
        inner.set(nativeIdentity, slot)
    }

    private deleteSlot(key: string): boolean {
        if (!this.partitionCompositeKeys) {
            const oldSlot = this.flatIndex.get(key)
            if (oldSlot === undefined) {
                return false
            }
            this.flatIndex.delete(key)
            this.releaseSlot(oldSlot)
            return true
        }
        const [sourceId, nativeIdentity] = splitKey(key)
        const inner = this.partitions.get(sourceId)
        if (!inner) {
            return false
        }
        const oldSlot = inner.get(nativeIdentity)
        if (oldSlot === undefined) {
            return false
        }
        inner.delete(nativeIdentity)
        this.partitionedCount--
        if (inner.size === 0) {
            this.partitions.delete(sourceId)
        }
        this.releaseSlot(oldSlot)
        return true
    }

    private appendRecord(value: V): number {
        const blockIndex = this.sealedBlocks.length
        const slot = blockIndex * this.blockSize + this.pending.length
        this.pending.push(value)
        this.blockLiveCounts[blockIndex] = (this.blockLiveCounts[blockIndex] ?? 0) + 1
        if (this.pending.length >= this.blockSize) {
            const compressed = deflateRawSync(Buffer.from(JSON.stringify(this.pending), 'utf8'), { level: 1 })
            this.sealedBlocks.push(compressed)
            this.pending = []
        }
        return slot
    }

    private releaseSlot(oldSlot: number): void {
        const blockIndex = Math.floor(oldSlot / this.blockSize)
        const remaining = (this.blockLiveCounts[blockIndex] ?? 0) - 1
        this.blockLiveCounts[blockIndex] = remaining > 0 ? remaining : 0
        if (remaining <= 0 && blockIndex < this.sealedBlocks.length && this.sealedBlocks[blockIndex].byteLength > 0) {
            this.sealedBlocks[blockIndex] = Buffer.alloc(0)
            this.lruCache.delete(blockIndex)
        }
    }

    private readSlot(slot: number): V {
        const blockIndex = Math.floor(slot / this.blockSize)
        const recordIndex = slot % this.blockSize
        if (blockIndex === this.sealedBlocks.length) {
            return this.pending[recordIndex]
        }
        return this.readSealedBlock(blockIndex)[recordIndex]
    }

    private readSealedBlock(blockIndex: number): V[] {
        const cached = this.lruCache.get(blockIndex)
        if (cached) {
            // Refresh recency in Map insertion order.
            this.lruCache.delete(blockIndex)
            this.lruCache.set(blockIndex, cached)
            return cached
        }

        const json = inflateRawSync(this.sealedBlocks[blockIndex]).toString('utf8')
        const records = JSON.parse(json) as V[]

        if (this.lruCapacity > 0) {
            if (this.lruCache.size >= this.lruCapacity) {
                const oldestKey = this.lruCache.keys().next().value
                if (oldestKey !== undefined) {
                    this.lruCache.delete(oldestKey)
                }
            }
            this.lruCache.set(blockIndex, records)
        }

        return records
    }

    private releaseCompressedStorage(): void {
        this.sealedBlocks = []
        this.blockLiveCounts = []
        this.pending = []
        this.lruCache.clear()
    }
}

function splitKey(key: string): [string, string] {
    const sepIdx = key.indexOf(COMPOSITE_KEY_SEPARATOR)
    if (sepIdx <= 0) {
        return ['', key]
    }
    return [key.slice(0, sepIdx), key.slice(sepIdx + COMPOSITE_KEY_SEPARATOR.length)]
}

function joinKey(sourceId: string, nativeIdentity: string): string {
    return sourceId === '' ? nativeIdentity : `${sourceId}${COMPOSITE_KEY_SEPARATOR}${nativeIdentity}`
}
