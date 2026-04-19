/**
 * Writes connector-spec.json → sourceConfigInitialValues from `connectorSpecInitialValues`
 * in src/data/connectorDefaults.ts (parsed as the object literal only; no TypeScript execution).
 */
const fs = require('fs')
const path = require('path')

const repoRoot = path.join(__dirname, '..')
const specPath = path.join(repoRoot, 'connector-spec.json')
const defaultsTsPath = path.join(repoRoot, 'src', 'data', 'connectorDefaults.ts')

function extractConnectorSpecInitialValuesObject(source) {
    const marker = 'export const connectorSpecInitialValues = '
    const start = source.indexOf(marker)
    if (start === -1) {
        throw new Error(`Could not find ${marker.trim()} in ${defaultsTsPath}`)
    }
    let i = start + marker.length
    while (i < source.length && /\s/.test(source[i])) i++
    if (source[i] !== '{') {
        throw new Error('Expected `{` after connectorSpecInitialValues =')
    }
    const objStart = i
    let depth = 0
    for (; i < source.length; i++) {
        const c = source[i]
        if (c === '{') depth++
        else if (c === '}') {
            depth--
            if (depth === 0) {
                return source.slice(objStart, i + 1)
            }
        }
    }
    throw new Error('Unclosed `{` in connectorSpecInitialValues')
}

function stripTrailingCommas(tsObjectLiteral) {
    // Remove trailing commas before `}` or `]` so JSON.parse accepts the slice.
    return tsObjectLiteral.replace(/,(\s*[}\]])/g, '$1')
}

function tsStringToJsonKey(key) {
    if (/^[a-zA-Z_$][\w$]*$/.test(key)) return JSON.stringify(key)
    return JSON.stringify(key)
}

function tsValueToJson(valueSlice) {
    const v = valueSlice.trim()
    if (v === 'true' || v === 'false' || v === 'null') return v
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        const inner = v.slice(1, -1)
        return JSON.stringify(inner)
    }
    throw new Error(`Unsupported literal in connectorSpecInitialValues: ${v.slice(0, 80)}`)
}

/**
 * Minimal parser: top-level `key: value` pairs only; values are bool, number, or quoted string.
 */
function objectLiteralToJson(tsObjectLiteral) {
    const inner = tsObjectLiteral.trim().slice(1, -1)
    const out = {}
    let pos = 0
    while (pos < inner.length) {
        while (pos < inner.length && /\s|,/.test(inner[pos])) pos++
        if (pos >= inner.length) break

        let keyEnd = pos
        if (inner[pos] === "'" || inner[pos] === '"') {
            const q = inner[pos]
            keyEnd = pos + 1
            while (keyEnd < inner.length && inner[keyEnd] !== q) {
                if (inner[keyEnd] === '\\') keyEnd++
                keyEnd++
            }
            var key = inner.slice(pos + 1, keyEnd)
            keyEnd++
        } else {
            while (keyEnd < inner.length && /[\w$]/.test(inner[keyEnd])) keyEnd++
            var key = inner.slice(pos, keyEnd)
        }
        while (keyEnd < inner.length && /\s/.test(inner[keyEnd])) keyEnd++
        if (inner[keyEnd] !== ':') {
            throw new Error(`Expected ':' after key near: ${inner.slice(pos, pos + 40)}`)
        }
        keyEnd++
        while (keyEnd < inner.length && /\s/.test(inner[keyEnd])) keyEnd++

        let valEnd = keyEnd
        if (inner[valEnd] === "'" || inner[valEnd] === '"') {
            const q = inner[valEnd]
            valEnd++
            while (valEnd < inner.length && inner[valEnd] !== q) {
                if (inner[valEnd] === '\\') valEnd++
                valEnd++
            }
            valEnd++
        } else {
            while (valEnd < inner.length && !/[\s,]/.test(inner[valEnd])) valEnd++
        }
        let rawVal = inner.slice(keyEnd, valEnd)
        // Allow TypeScript `as const` after a value
        let tail = valEnd
        while (tail < inner.length && /\s/.test(inner[tail])) tail++
        if (inner.slice(tail, tail + 2) === 'as') {
            const m = inner.slice(tail).match(/^as\s+const\b/)
            if (m) tail += m[0].length
        }
        while (tail < inner.length && /\s/.test(inner[tail])) tail++
        if (inner[tail] === ',') tail++
        const jsonKey = tsStringToJsonKey(key)
        const jsonVal = tsValueToJson(rawVal)
        out[JSON.parse(jsonKey)] = JSON.parse(jsonVal)
        pos = tail
    }
    return out
}

const source = fs.readFileSync(defaultsTsPath, 'utf8')
const literal = stripTrailingCommas(extractConnectorSpecInitialValuesObject(source))
const initial = objectLiteralToJson(literal)

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
spec.sourceConfigInitialValues = initial
fs.writeFileSync(specPath, JSON.stringify(spec, null, 4) + '\n', 'utf8')
