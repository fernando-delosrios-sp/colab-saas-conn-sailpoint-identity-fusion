/**
 * velocityjs applies References mixins onto `Compile.prototype` when `velocityjs` loads.
 * This file must be `require()`d before `require('velocityjs')` elsewhere so we can wrap
 * property/index resolution and block `.constructor` / `__proto__` reaching `Function`.
 */
'use strict'

const path = require('path')

require('velocityjs')

const DANGEROUS_PROPERTY_KEYS = new Set(['constructor', '__proto__'])

// velocityjs applies mixins onto `Compile.prototype` (not `Velocity.prototype`); see compile/index.cjs.
const baseCompilePath = path.join(path.dirname(require.resolve('velocityjs')), 'compile', 'base-compile.cjs')
const { Compile } = require(baseCompilePath)

const origGetAttributes = Compile.prototype.getAttributes
Compile.prototype.getAttributes = function velocitySafeGetAttributes(property, baseRef, ast) {
    if (baseRef != null && baseRef !== undefined && property.type === 'property') {
        const key = property.id
        if (typeof key === 'string' && DANGEROUS_PROPERTY_KEYS.has(key)) {
            return undefined
        }
    }
    return origGetAttributes.call(this, property, baseRef, ast)
}

const origGetPropIndex = Compile.prototype.getPropIndex
Compile.prototype.getPropIndex = function velocitySafeGetPropIndex(property, baseRef) {
    const ast = property.id
    const key = ast.type === 'references' ? this.getReferences(ast) : ast.value
    if (typeof key === 'string' && DANGEROUS_PROPERTY_KEYS.has(key)) {
        return undefined
    }
    return origGetPropIndex.call(this, property, baseRef)
}
