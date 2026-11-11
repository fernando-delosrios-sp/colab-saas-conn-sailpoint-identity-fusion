/* global describe, it, expect, afterEach */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { packConnectorZip } = require('../pack-connector-zip.cjs')

const spec = {
    sourceConfig: [
        {
            type: 'menu',
            label: 'Advanced Settings',
            items: [
                {
                    type: 'section',
                    sectionTitle: 'Developer Settings',
                    sectionHelpMessage:
                        '<strong>Advanced options.</strong><br><br>Installed connector version: <strong>2.2.0</strong>.<br><br>See also: <a href="https://example.test/use-guides/operation/">Operation guides</a>.',
                    docLinkLabel: 'Advanced settings reference',
                    docLink: 'https://example.test/configuration/advanced/',
                    items: [],
                },
            ],
        },
    ],
}

const tempDirs = []

function makeRepo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-connector-zip-'))
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'connector-spec.json'), `${JSON.stringify(spec, null, 4)}\n`)
    return dir
}

afterEach(() => {
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop(), { recursive: true, force: true })
    }
})

describe('packConnectorZip', () => {
    it('stamps the spec while the package command runs, then restores it and returns 0', () => {
        const cwd = makeRepo()
        const specPath = path.join(cwd, 'connector-spec.json')
        const original = fs.readFileSync(specPath, 'utf8')
        let stampedWhileRunning = null

        const status = packConnectorZip({
            cwd,
            stamp: 'Build: def5678 2026-11-01 2.2.0/preview',
            exec: (_command, _args, options) => {
                stampedWhileRunning = fs.readFileSync(path.join(options.cwd, 'connector-spec.json'), 'utf8')
                return { status: 0 }
            },
        })

        expect(status).toBe(0)
        expect(stampedWhileRunning).toContain('Build:')
        expect(stampedWhileRunning).toContain('def5678')
        expect(fs.readFileSync(specPath, 'utf8')).toBe(original)
    })

    it('restores the spec and returns a non-zero status when the package command fails', () => {
        const cwd = makeRepo()
        const specPath = path.join(cwd, 'connector-spec.json')
        const original = fs.readFileSync(specPath, 'utf8')

        const status = packConnectorZip({
            cwd,
            stamp: 'Build: def5678 2026-11-01 2.2.0/preview',
            exec: () => ({ status: 1 }),
        })

        expect(status).not.toBe(0)
        expect(fs.readFileSync(specPath, 'utf8')).toBe(original)
    })
})
