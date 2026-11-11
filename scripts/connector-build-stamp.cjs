#!/usr/bin/env node

/**
 * Connector build stamp: resolves the identity of the tree being packed, formats it for
 * the Developer Settings help, and injects it into connector-spec.json around packaging.
 *
 * The committed connector-spec.json must stay unstamped; stamping is temporary and is
 * reverted by the pack wrapper in scripts/pack-connector-zip.cjs.
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const BUILD_LABEL = 'Build:'
const UNKNOWN_STAMP = 'Build: unknown'
const SPEC_FILE_NAME = 'connector-spec.json'

function defaultExec(command, args, options = {}) {
    return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8' })
}

/**
 * @param {{ sha?: string, date?: string, branch?: string, dirty?: boolean }} facts
 * @returns {string}
 */
function formatBuildStamp({ sha, date, branch, dirty } = {}) {
    const shortSha = String(sha || '').trim()
    const commitDate = String(date || '').trim()
    const branchName = String(branch || '').trim()

    if (!shortSha || !commitDate || !branchName) {
        return UNKNOWN_STAMP
    }

    return `${BUILD_LABEL} ${shortSha}${dirty ? '-dirty' : ''} ${commitDate} ${branchName}`
}

/**
 * @param {{ status?: number, stdout?: string | Buffer } | undefined} result
 * @returns {string | null}
 */
function successfulOutput(result) {
    if (!result || result.status !== 0) {
        return null
    }

    const output = String(result.stdout || '').trim()
    return output || null
}

/**
 * @param {string} porcelain
 * @returns {boolean}
 */
function isDirtyPorcelain(porcelain) {
    return String(porcelain || '')
        .split('\n')
        .some((line) => {
            if (!line || line.startsWith('!!')) {
                return false
            }

            const paths = line
                .slice(3)
                .split(' -> ')
                .map((entry) => entry.trim())

            return paths.some((entry) => entry && entry !== SPEC_FILE_NAME)
        })
}

/**
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, exec?: (command: string, args: string[], options?: object) => unknown }} [options]
 * @returns {string}
 */
function resolveBuildStamp({ cwd = process.cwd(), env = process.env, exec = defaultExec } = {}) {
    const run = (args) => exec('git', args, { cwd, encoding: 'utf8' })

    const sha = successfulOutput(run(['rev-parse', '--short=7', 'HEAD']))
    const date = successfulOutput(run(['show', '-s', '--format=%cs', 'HEAD']))

    if (!sha || !date) {
        return UNKNOWN_STAMP
    }

    let branch = String(env.GITHUB_REF_NAME || env.GITHUB_HEAD_REF || '').trim()
    if (!branch) {
        branch = successfulOutput(run(['rev-parse', '--abbrev-ref', 'HEAD']))
        if (!branch) {
            return UNKNOWN_STAMP
        }
        if (branch === 'HEAD') {
            branch = 'detached'
        }
    }

    const status = run(['status', '--porcelain', '--untracked-files=normal'])
    if (!status || status.status !== 0) {
        return UNKNOWN_STAMP
    }

    return formatBuildStamp({
        sha,
        date,
        branch,
        dirty: isDirtyPorcelain(status.stdout),
    })
}

/**
 * @param {object} spec
 * @returns {object | null}
 */
function findDeveloperSettingsSection(spec) {
    const queue = [...(spec.sourceConfig || [])]

    while (queue.length > 0) {
        const item = queue.shift()
        if (!item || typeof item !== 'object') {
            continue
        }

        if (item.type === 'section' && item.sectionTitle === 'Developer Settings') {
            return item
        }

        if (Array.isArray(item.items)) {
            queue.push(...item.items)
        }
        for (const subMenu of item.subMenus || []) {
            queue.push(...(subMenu.items || []))
        }
    }

    return null
}

/**
 * @param {string} message
 * @returns {string}
 */
function stripBuildStamp(message) {
    return String(message || '')
        .replace(/(?:\s*<br><br>)?\s*Build:.*?(?=<br><br>|$)/s, '')
        .trimEnd()
}

/**
 * @param {string} stamp
 * @returns {string}
 */
function buildStampToHtml(stamp) {
    const text = String(stamp || '').trim()
    if (!text || text === UNKNOWN_STAMP) {
        return UNKNOWN_STAMP
    }

    const match = /^Build:\s+(\S+)(\s+.*)?$/.exec(text)
    if (!match) {
        return text
    }

    return `${BUILD_LABEL} <strong>${match[1]}</strong>${match[2] || ''}`
}

/**
 * @param {string} message
 * @param {number} start
 * @returns {number}
 */
function installedVersionSentenceEnd(message, start) {
    const strongEnd = message.indexOf('</strong>', start)
    if (strongEnd !== -1) {
        const dot = message.indexOf('.', strongEnd)
        if (dot !== -1) {
            return dot + 1
        }
    }

    const sentenceEnd = /\.(?=\s*(?:<br|$))/.exec(message.slice(start))
    return sentenceEnd ? start + sentenceEnd.index + 1 : -1
}

/**
 * @param {object} spec
 * @param {string} stamp
 * @returns {object}
 */
function injectBuildStamp(spec, stamp) {
    const section = findDeveloperSettingsSection(spec)
    if (!section) {
        throw new Error('connector-spec.json has no Developer Settings section to stamp')
    }

    const htmlStamp = buildStampToHtml(stamp)
    const message = stripBuildStamp(section.sectionHelpMessage)
    const marker = 'Installed connector version:'
    const markerIndex = message.indexOf(marker)

    let sentenceEnd = -1
    if (markerIndex !== -1) {
        sentenceEnd = installedVersionSentenceEnd(message, markerIndex)
    }

    if (sentenceEnd === -1) {
        section.sectionHelpMessage = `${message}<br><br>${htmlStamp}`
    } else {
        section.sectionHelpMessage = `${message.slice(0, sentenceEnd)}<br><br>${htmlStamp}${message.slice(sentenceEnd)}`
    }

    return spec
}

/**
 * @param {object} spec
 * @returns {object}
 */
function removeBuildStamp(spec) {
    const section = findDeveloperSettingsSection(spec)
    if (!section) {
        throw new Error('connector-spec.json has no Developer Settings section to restore')
    }

    section.sectionHelpMessage = stripBuildStamp(section.sectionHelpMessage)
    return spec
}

/**
 * @param {{ specPath?: string, cwd?: string }} [options]
 * @returns {string}
 */
function connectorSpecPath({ specPath, cwd = process.cwd() } = {}) {
    return specPath || path.join(cwd, SPEC_FILE_NAME)
}

/**
 * @param {{ specPath?: string, cwd?: string, env?: object, exec?: (command: string, args: string[], options?: object) => unknown, stamp?: string }} [options]
 * @returns {{ specPath: string, original: string, stamp: string }}
 */
function stampConnectorSpecFile(options = {}) {
    const specPath = connectorSpecPath(options)
    const original = fs.readFileSync(specPath, 'utf8')
    const spec = JSON.parse(original)
    const stamp = options.stamp || resolveBuildStamp(options)

    injectBuildStamp(spec, stamp)
    fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 4)}\n`)

    return { specPath, original, stamp }
}

/**
 * @param {{ specPath: string, original: string }} stamped
 */
function restoreConnectorSpecFile({ specPath, original }) {
    fs.writeFileSync(specPath, original)
}

/**
 * @param {string[]} [argv]
 * @returns {number}
 */
function main(argv = process.argv.slice(2)) {
    const action = argv[0] || '--print'
    const cwd = process.cwd()

    if (action === '--print') {
        console.log(resolveBuildStamp({ cwd }))
        return 0
    }

    if (action === '--write') {
        const { stamp } = stampConnectorSpecFile({ cwd })
        console.log(stamp)
        return 0
    }

    if (action === '--restore') {
        const specPath = connectorSpecPath({ cwd })
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
        removeBuildStamp(spec)
        fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 4)}\n`)
        console.log('Removed the connector build stamp from connector-spec.json.')
        return 0
    }

    console.error(`Unknown option: ${action}. Use --print, --write, or --restore.`)
    return 1
}

if (require.main === module) {
    process.exitCode = main()
}

module.exports = {
    BUILD_LABEL,
    UNKNOWN_STAMP,
    formatBuildStamp,
    resolveBuildStamp,
    injectBuildStamp,
    removeBuildStamp,
    stampConnectorSpecFile,
    restoreConnectorSpecFile,
    main,
}
