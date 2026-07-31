#!/usr/bin/env node
/**
 * Export docs/operations/diagrams/*.drawio to docs/assets/images/operations/*.png
 * via the diagrams.net convert service (requires network).
 *
 * Usage: node scripts/export-drawio-pngs.cjs
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const querystring = require('querystring')

const rootDir = path.resolve(__dirname, '..')
const diagramsDir = path.join(rootDir, 'docs', 'operations', 'diagrams')
const outDir = path.join(rootDir, 'docs', 'assets', 'images', 'operations')

function exportPng(drawioPath, outPath) {
    return new Promise((resolve, reject) => {
        const xml = fs.readFileSync(drawioPath, 'utf8')
        const body = querystring.stringify({
            format: 'png',
            xml,
            w: 0,
            h: 0,
            border: 10,
            bg: '#ffffff',
            scale: 2,
        })
        const req = https.request(
            {
                hostname: 'convert.diagrams.net',
                path: '/node/export',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(body),
                    Referer: 'https://app.diagrams.net/',
                },
            },
            (res) => {
                const chunks = []
                res.on('data', (c) => chunks.push(c))
                res.on('end', () => {
                    const buf = Buffer.concat(chunks)
                    if (res.statusCode !== 200 || buf.length < 1000) {
                        reject(
                            new Error(
                                `${path.basename(drawioPath)}: HTTP ${res.statusCode} — ${buf.toString().slice(0, 120)}`
                            )
                        )
                        return
                    }
                    fs.writeFileSync(outPath, buf)
                    resolve(buf.length)
                })
            }
        )
        req.on('error', reject)
        req.write(body)
        req.end()
    })
}

async function main() {
    fs.mkdirSync(outDir, { recursive: true })
    const files = fs.readdirSync(diagramsDir).filter((f) => f.endsWith('.drawio'))
    if (files.length === 0) {
        console.log('No .drawio files found in docs/operations/diagrams/')
        return
    }
    for (const file of files) {
        const base = file.replace(/\.drawio$/, '')
        const size = await exportPng(path.join(diagramsDir, file), path.join(outDir, `${base}.png`))
        console.log(`Exported ${base}.png (${size} bytes)`)
    }
}

main().catch((err) => {
    console.error(err.message || err)
    process.exit(1)
})
