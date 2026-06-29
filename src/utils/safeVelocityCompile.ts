import velocityjs from 'velocityjs'
import type { Attribute, CompileConfig, IndexAttribute, ReferencesAST, VELOCITY_AST } from 'velocityjs/dist/src/type'

const DANGEROUS_PROPERTY_KEYS = new Set(['constructor', '__proto__'])

type CompileWithReferences = {
    getAttributes: (property: Attribute, baseRef: unknown, ast: ReferencesAST) => any
    getPropIndex: (property: IndexAttribute, baseRef: object) => unknown
    getReferences: (ast: ReferencesAST) => string
}

const CompileProto = velocityjs.Compile.prototype as unknown as CompileWithReferences
const origGetAttributes = CompileProto.getAttributes
const origGetPropIndex = CompileProto.getPropIndex

/**
 * `velocityjs` applies a `References` mixin onto `Compile.prototype` at module load.
 * The mixin provides `getAttributes` / `getPropIndex` for resolving `$foo.bar` and
 * `$foo[bar]` paths. Without guarding, a template that reads `$foo.constructor` or
 * `$foo.__proto__` can leak references to the global `Function` / `Object` prototypes.
 *
 * `SafeCompile` subclasses `velocityjs.Compile` and overrides the two path-resolution
 * methods to short-circuit dangerous keys, isolating the patch from the global
 * `Compile.prototype` so other consumers in the same Node.js process are unaffected.
 *
 * The mixin methods are not part of the published `Compile` type, so we capture
 * direct references to the parent prototype's methods and invoke them with the
 * current `this`.
 */
export class SafeCompile extends velocityjs.Compile {
    constructor(asts: VELOCITY_AST[], config?: CompileConfig) {
        super(asts, config)
    }

    getAttributes(property: Attribute, baseRef: unknown, ast: ReferencesAST): any {
        if (baseRef != null && property.type === 'property') {
            const key = (property as { id: string }).id
            if (typeof key === 'string' && DANGEROUS_PROPERTY_KEYS.has(key)) {
                return undefined
            }
        }
        return origGetAttributes.call(this, property, baseRef, ast)
    }

    getPropIndex(property: IndexAttribute, baseRef: object): unknown {
        const id = property.id
        const refs = this as unknown as CompileWithReferences
        const key = id.type === 'references' ? refs.getReferences(id) : (id as { value: unknown }).value
        if (typeof key === 'string' && DANGEROUS_PROPERTY_KEYS.has(key)) {
            return undefined
        }
        return origGetPropIndex.call(this, property, baseRef)
    }
}
