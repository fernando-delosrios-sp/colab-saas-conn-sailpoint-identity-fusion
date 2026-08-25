type RenderContext = Record<string, any>

/**
 * Copy enumerable keys from `source` and its prototypes onto a null-prototype object.
 * Stops before `Object.prototype` so `$constructor` is not copied from the prototype chain.
 * Nearer objects override farther ones (own keys win over inherited current-bag keys).
 */
export const copyVelocityCallerContext = (source: RenderContext, extras?: RenderContext): RenderContext => {
    const copied = Object.create(null) as RenderContext
    const layers: object[] = []
    for (
        let current: object | null = source;
        current != null && current !== Object.prototype;
        current = Object.getPrototypeOf(current)
    ) {
        layers.push(current)
    }
    for (let i = layers.length - 1; i >= 0; i--) {
        Object.assign(copied, layers[i])
    }
    if (extras) {
        Object.assign(copied, extras)
    }
    return copied
}
