import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `spcx package` writes only `dist/index.js` into the customizer zip.
 * At runtime the hook reads `data/internal-records` beside that file, so this
 * step adds the staged manifest, configuration, and shards after `spcx` finishes.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const dist = path.join(root, 'dist')
const zipName = `${pkg.name}-${pkg.version}.zip`
const zipPath = path.join(dist, zipName)
const manifestPath = path.join(dist, 'data', 'internal-records', 'manifest.json')

if (!existsSync(zipPath)) {
    console.error(`Customizer zip is missing: ${zipPath}`)
    process.exit(1)
}
if (!existsSync(manifestPath)) {
    console.error(`Internal record manifest is missing: ${manifestPath}`)
    process.exit(1)
}

// Identity Security Cloud rejects (HTTP 500) a customizer zip whose nested entries lack an explicit parent
// directory entry, so `data/` is added on its own before the recursive add.
execFileSync('zip', ['-q', '-X', zipName, 'data'], { cwd: dist, stdio: 'inherit' })
execFileSync('zip', ['-q', '-r', '-X', zipName, 'data/internal-records'], { cwd: dist, stdio: 'inherit' })

const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' })
const required = [
    'index.js',
    'data/',
    'data/internal-records/',
    'data/internal-records/manifest.json',
    'data/internal-records/internal-record-configuration.json',
]
const entries = new Set(listing.split('\n').map((line) => line.trim().split(/\s+/).slice(3).join(' ')))
for (const entry of required) {
    if (!entries.has(entry)) {
        console.error(`Customizer zip is missing ${entry}`)
        process.exit(1)
    }
}
const shardCount = listing.split('\n').filter((line) => line.trimEnd().endsWith('.hrb')).length
if (shardCount === 0) {
    console.error('Customizer zip contains no internal-record shards')
    process.exit(1)
}
console.info(`Customizer zip includes ${shardCount} internal-record shard(s): ${zipName}`)
