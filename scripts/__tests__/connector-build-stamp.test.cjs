/* global describe, it, expect */
const fs = require('fs')
const path = require('path')
const {
    formatBuildStamp,
    resolveBuildStamp,
    injectBuildStamp,
} = require('../connector-build-stamp.cjs')
const { collectViolations } = require('../connector-spec-help-lib.cjs')

const rootDir = path.resolve(__dirname, '..', '..')
const specPath = path.join(rootDir, 'connector-spec.json')

function developerSettingsMessage(spec) {
    const menu = spec.sourceConfig.find((entry) => entry.type === 'menu')
    const section = menu.items.find(
        (item) => item.type === 'section' && item.sectionTitle === 'Developer Settings'
    )
    return section.sectionHelpMessage
}

function specWithDeveloperSettings(sectionHelpMessage) {
    return {
        sourceConfig: [
            {
                type: 'menu',
                label: 'Advanced Settings',
                items: [
                    {
                        type: 'section',
                        sectionTitle: 'Developer Settings',
                        sectionHelpMessage,
                        docLinkLabel: 'Advanced settings reference',
                        docLink:
                            'https://fernando-delosrios-sp.github.io/colab-saas-conn-sailpoint-identity-fusion/configuration/advanced/',
                        items: [],
                    },
                ],
            },
        ],
    }
}

function gitExec({ sha, date, branch, status }) {
    return (_command, args) => {
        const key = args.join(' ')
        if (key.includes('rev-parse') && key.includes('--short=7')) {
            return { status: sha === undefined ? 1 : 0, stdout: `${sha || ''}\n`, stderr: '' }
        }
        if (key.includes('show') && key.includes('%cs')) {
            return { status: date === undefined ? 1 : 0, stdout: `${date || ''}\n`, stderr: '' }
        }
        if (key.includes('rev-parse') && key.includes('--abbrev-ref')) {
            return { status: branch === undefined ? 1 : 0, stdout: `${branch || ''}\n`, stderr: '' }
        }
        if (key.includes('status') && key.includes('--porcelain')) {
            return { status: status === undefined ? 1 : 0, stdout: `${status || ''}\n`, stderr: '' }
        }
        return { status: 1, stdout: '', stderr: 'unexpected command' }
    }
}

describe('formatBuildStamp', () => {
    it('renders the canonical clean stamp', () => {
        expect(
            formatBuildStamp({ sha: 'def5678', date: '2026-11-01', branch: '2.2.0/preview', dirty: false })
        ).toBe('Build: def5678 2026-11-01 2.2.0/preview')
    })

    it('marks dirty input', () => {
        expect(
            formatBuildStamp({ sha: 'def5678', date: '2026-11-01', branch: '2.2.0/preview', dirty: true })
        ).toBe('Build: def5678-dirty 2026-11-01 2.2.0/preview')
    })

    it('renders unknown when every fact is missing', () => {
        expect(formatBuildStamp({})).toBe('Build: unknown')
    })
})

describe('resolveBuildStamp', () => {
    it('prefers GITHUB_REF_NAME over the local branch', () => {
        expect(
            resolveBuildStamp({
                cwd: '/repo',
                env: { GITHUB_REF_NAME: '2.2.0/preview' },
                exec: gitExec({ sha: 'def5678', date: '2026-11-01', branch: 'local-branch', status: '' }),
            })
        ).toBe('Build: def5678 2026-11-01 2.2.0/preview')
    })

    it('uses GITHUB_HEAD_REF when GITHUB_REF_NAME is absent', () => {
        expect(
            resolveBuildStamp({
                cwd: '/repo',
                env: { GITHUB_HEAD_REF: 'feature/build-stamp' },
                exec: gitExec({ sha: 'def5678', date: '2026-11-01', branch: 'local-branch', status: '' }),
            })
        ).toBe('Build: def5678 2026-11-01 feature/build-stamp')
    })

    it('renders detached for a detached checkout without CI env', () => {
        expect(
            resolveBuildStamp({
                cwd: '/repo',
                env: {},
                exec: gitExec({ sha: 'def5678', date: '2026-11-01', branch: 'HEAD', status: '' }),
            })
        ).toBe('Build: def5678 2026-11-01 detached')
    })

    it('renders unknown instead of throwing when a git command fails', () => {
        expect(
            resolveBuildStamp({
                cwd: '/repo',
                env: {},
                exec: gitExec({ sha: undefined, date: '2026-11-01', branch: '2.2.0/preview', status: '' }),
            })
        ).toBe('Build: unknown')
    })
})

describe('dirty detection', () => {
    it('marks a modified source file dirty', () => {
        expect(
            resolveBuildStamp({
                cwd: '/repo',
                env: {},
                exec: gitExec({
                    sha: 'def5678',
                    date: '2026-11-01',
                    branch: '2.2.0/preview',
                    status: ' M src/index.ts',
                }),
            })
        ).toBe('Build: def5678-dirty 2026-11-01 2.2.0/preview')
    })

    it('does not mark a modified connector-spec.json dirty', () => {
        expect(
            resolveBuildStamp({
                cwd: '/repo',
                env: {},
                exec: gitExec({
                    sha: 'def5678',
                    date: '2026-11-01',
                    branch: '2.2.0/preview',
                    status: ' M connector-spec.json',
                }),
            })
        ).toBe('Build: def5678 2026-11-01 2.2.0/preview')
    })

    it('does not mark an ignored path dirty', () => {
        expect(
            resolveBuildStamp({
                cwd: '/repo',
                env: {},
                exec: gitExec({
                    sha: 'def5678',
                    date: '2026-11-01',
                    branch: '2.2.0/preview',
                    status: '!! logs/debug.log',
                }),
            })
        ).toBe('Build: def5678 2026-11-01 2.2.0/preview')
    })
})

describe('injectBuildStamp', () => {
    const baseHelp = `<strong>Advanced options.</strong><br><br>Installed connector version: <strong>2.2.0</strong>.<br><br>See also: <a href="https://example.test/use-guides/operation/">Operation guides</a>.`

    it('adds one Build sentence after the installed connector version sentence', () => {
        const spec = specWithDeveloperSettings(baseHelp)

        injectBuildStamp(spec, 'Build: def5678 2026-11-01 2.2.0/preview')

        const help = developerSettingsMessage(spec)
        expect(help).toContain('Installed connector version: <strong>2.2.0</strong>.')
        expect(help).toContain('Build: <strong>def5678</strong> 2026-11-01 2.2.0/preview')
        expect(help.indexOf('Build:')).toBeGreaterThan(help.indexOf('Installed connector version:'))
        expect(help.indexOf('Build:')).toBeLessThan(help.indexOf('See also:'))
        expect(help.match(/Build:/g)).toHaveLength(1)
    })

    it('replaces an existing stamp instead of duplicating it', () => {
        const spec = specWithDeveloperSettings(baseHelp)

        injectBuildStamp(spec, 'Build: def5678 2026-11-01 2.2.0/preview')
        injectBuildStamp(spec, 'Build: abc1234 2026-11-02 2.2.0/preview')

        const help = developerSettingsMessage(spec)
        expect(help.match(/Build:/g)).toHaveLength(1)
        expect(help).toContain('abc1234')
        expect(help).not.toContain('def5678')
    })

    it('fails loudly when the spec has no Developer Settings section', () => {
        const spec = specWithDeveloperSettings(baseHelp)
        spec.sourceConfig[0].items[0].sectionTitle = 'Sources'

        expect(() => injectBuildStamp(spec, 'Build: def5678 2026-11-01 2.2.0/preview')).toThrow(
            /Developer Settings/
        )
    })

    it('injects Build: unknown without throwing when git facts were unavailable', () => {
        const spec = specWithDeveloperSettings(baseHelp)

        injectBuildStamp(spec, formatBuildStamp({}))

        const help = developerSettingsMessage(spec)
        expect(help).toContain('Build: unknown')
        expect(help.match(/Build:/g)).toHaveLength(1)
    })

    it('uses the commit date rather than the pack date', () => {
        const today = new Date().toISOString().slice(0, 10)
        const stamp = resolveBuildStamp({
            cwd: '/repo',
            env: {},
            exec: gitExec({ sha: 'def5678', date: '2026-11-01', branch: '2.2.0/preview', status: '' }),
        })

        expect(stamp).toContain('2026-11-01')
        expect(stamp).not.toContain(today)
    })
})

describe('formatting guard', () => {
    it('keeps the committed connector-spec.json byte-for-byte stable through a parse/stringify round trip', () => {
        const committed = fs.readFileSync(specPath, 'utf8')
        const roundTripped = `${JSON.stringify(JSON.parse(committed), null, 4)}\n`

        expect(roundTripped).toBe(committed)
    })

    it('keeps a stamped Developer Settings help within the inline help limits', () => {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))

        injectBuildStamp(spec, 'Build: def5678-dirty 2026-11-01 2.2.0/preview')

        const violations = collectViolations(spec).filter((violation) => violation.id === 'Developer Settings')
        expect(violations).toEqual([])
    })
})
