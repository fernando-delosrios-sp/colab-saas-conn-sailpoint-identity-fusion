/**
 * Lightweight `ReadonlySet<string>` view over a single bare `string` key so internal
 * `getKeys()` callers can inspect or iterate without allocating a `Set<string>`.
 */
class SingleKeySetView implements ReadonlySet<string> {
    constructor(private readonly value: string) {}

    get size(): number {
        return 1
    }

    has(value: string): boolean {
        return this.value === value
    }

    forEach(callbackfn: (value: string, value2: string, set: ReadonlySet<string>) => void, thisArg?: unknown): void {
        callbackfn.call(thisArg, this.value, this.value, this)
    }

    *entries(): IterableIterator<[string, string]> {
        yield [this.value, this.value]
    }

    *keys(): IterableIterator<string> {
        yield this.value
    }

    *values(): IterableIterator<string> {
        yield this.value
    }

    [Symbol.iterator](): IterableIterator<string> {
        return this.values()
    }
}

/**
 * `Map<string, Set<string>>` that stores single-key entries as a bare `string` internally
 * to avoid allocating millions of single-element `Set` instances during bulk ingest.
 *
 * An entry is promoted to a `Set<string>` only when a second distinct key is added via
 * {@link addKey} or when an external caller invokes `.get(id)`. Internal callers should use
 * {@link addKey}, {@link deleteKey}, {@link getKeys}, and {@link takeKeys} to stay allocation-free.
 */
export class CompactStringSetMap extends Map<string, Set<string>> {
    /**
     * Adds `key` under `id` without allocating a `Set` when `id` has at most one key.
     */
    addKey(id: string, key: string): void {
        const entry = super.get(id) as string | Set<string> | undefined
        if (entry === undefined) {
            super.set(id, key as unknown as Set<string>)
            return
        }
        if (typeof entry === 'string') {
            if (entry !== key) {
                super.set(id, new Set([entry, key]))
            }
            return
        }
        entry.add(key)
    }

    /**
     * Removes `key` from `id`, deleting the entry when empty or demoting back to a bare
     * `string` when one key remains.
     */
    deleteKey(id: string, key: string): boolean {
        const entry = super.get(id) as string | Set<string> | undefined
        if (entry === undefined) return false
        if (typeof entry === 'string') {
            if (entry !== key) return false
            super.delete(id)
            return true
        }
        const removed = entry.delete(key)
        if (!removed) return false
        if (entry.size === 0) {
            super.delete(id)
        } else if (entry.size === 1) {
            const remaining = entry.values().next().value
            if (remaining !== undefined) {
                super.set(id, remaining as unknown as Set<string>)
            }
        }
        return true
    }

    /**
     * Returns a non-promoting `ReadonlySet<string>` view of keys for `id`.
     */
    getKeys(id: string): ReadonlySet<string> | undefined {
        const entry = super.get(id) as string | Set<string> | undefined
        if (entry === undefined) return undefined
        if (typeof entry === 'string') {
            return new SingleKeySetView(entry)
        }
        return entry
    }

    /**
     * Removes and returns all keys for `id` without promoting a single-key entry to `Set`.
     */
    takeKeys(id: string): Iterable<string> | undefined {
        const entry = super.get(id) as string | Set<string> | undefined
        if (entry === undefined) return undefined
        super.delete(id)
        if (typeof entry === 'string') {
            return [entry]
        }
        return entry
    }

    override get(id: string): Set<string> | undefined {
        const entry = super.get(id) as string | Set<string> | undefined
        if (entry === undefined) return undefined
        if (typeof entry === 'string') {
            const promoted = new Set([entry])
            super.set(id, promoted)
            return promoted
        }
        return entry
    }

    override *values(): IterableIterator<Set<string>> {
        for (const entry of super.values() as IterableIterator<string | Set<string>>) {
            yield typeof entry === 'string' ? new Set([entry]) : entry
        }
    }

    override *entries(): IterableIterator<[string, Set<string>]> {
        for (const [id, entry] of super.entries() as IterableIterator<[string, string | Set<string>]>) {
            yield [id, typeof entry === 'string' ? new Set([entry]) : entry]
        }
    }

    override [Symbol.iterator](): IterableIterator<[string, Set<string>]> {
        return this.entries()
    }

    override forEach(
        callbackfn: (value: Set<string>, key: string, map: Map<string, Set<string>>) => void,
        thisArg?: unknown
    ): void {
        for (const [id, set] of this.entries()) {
            callbackfn.call(thisArg, set, id, this)
        }
    }
}
