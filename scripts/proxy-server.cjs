#!/usr/bin/env node
/**
 * Local proxy server wrapper around spcx.
 *
 * spcx only accepts JSON connector commands `{ type, input, config }`.
 * Misrouted plain-text log POSTs must not land in a flat proxy-ingest file —
 * use the same tenant-scoped path as LogService disk routing.
 */
const express = require('express')
const fs = require('fs')
const path = require('path')
const stream = require('stream')
const util = require('util')
const childProcess = require('child_process')
const { _withConfig, ConnectorError, ConnectorErrorType } = require('@sailpoint/connector-sdk/dist/lib')
const { loadDotEnv } = require('./loadDotEnv.cjs')
const { FUSION_BASEURL_HEADER, resolveLogFilePath, isDeprecatedIngestLogPath } = require('./logPath.cjs')

loadDotEnv()

if (process.env.LOG_FILE && isDeprecatedIngestLogPath(process.env.LOG_FILE)) {
    console.warn(
        'Ignoring deprecated LOG_FILE=logs/proxy-ingest.log — external logs use logs/<tenant>/fusion-YYYYMMDD.log'
    )
    delete process.env.LOG_FILE
}

const COMMAND_RUN = 'run'
const argv = process.argv.slice(2)

if (!argv[0]) {
    throw new Error('missing arg: need connector path (e.g. dist/index.js)')
}

let connectorPath = path.resolve(process.cwd(), argv[0])
let port = Number(process.env.PORT) || Number(argv[1]) || 3000
if (argv[0] === COMMAND_RUN) {
    connectorPath = path.resolve(process.cwd(), argv[1])
    port = Number(process.env.PORT) || Number(argv[2]) || 3000
}

if (path.extname(connectorPath) !== '.js') {
    throw new Error(`invalid file path: ${connectorPath}`)
}

const sanitizeLog = (message) => {
    if (typeof message !== 'string') {
        try {
            message = JSON.stringify(message)
        } catch {
            message = String(message)
        }
    }
    // eslint-disable-next-line no-control-regex
    return message.replace(/[\x00-\x08\x0A-\x1F\x7F\u0085\u2028\u2029]+/g, ' ')
}

const appendPlainLog = (message, baseurl) => {
    const logFile = resolveLogFilePath(baseurl)
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    fs.appendFileSync(logFile, `${sanitizeLog(message)}\n`)
    return logFile
}

const spawnTsc = () => {
    const tsc = childProcess
        .spawn(/^win/.test(process.platform) ? 'tsc.cmd' : 'tsc', ['--inlineSourcemap', 'true', '--sourceMap', 'false', '--watch'], {
            shell: true,
        })
        .once('spawn', () => {
            tsc.stdout.on('data', (data) => console.log(`tsc: ${data}`))
            tsc.stderr.on('data', (data) => console.error(`tsc: ${data}`))
        })
        .once('error', () => {})
    return tsc
}

spawnTsc()

const loadConnector = async (connectorModulePath) => {
    const c = require(connectorModulePath)
    const connector = c.connector
    const connectorCustomizer = c.connectorCustomizer
    Object.keys(require.cache)
        .filter((key) => !key.includes('node_modules'))
        .forEach((key) => delete require.cache[key])
    return {
        connector: typeof connector === 'function' ? await connector() : connector,
        connectorCustomizer:
            typeof connectorCustomizer === 'function' ? await connectorCustomizer() : connectorCustomizer,
    }
}

const runConnectorCommand = async (cmd, res) => {
    res.type('application/x-ndjson')
    await _withConfig(cmd.config, async () => {
        const c = await loadConnector(connectorPath)
        const out = new stream.Transform({
            writableObjectMode: true,
            transform(chunk, encoding, callback) {
                try {
                    this.push(`${JSON.stringify(chunk)}\n`)
                } catch (e) {
                    callback(e)
                    return
                }
                callback()
            },
        })

        stream.pipeline(out, res, (err) => {
            if (err) {
                console.error(err)
            }
        })

        await new Promise(async (resolve, reject) => {
            out.on('finish', () => resolve())
            out.on('error', (e) => reject(e))
            try {
                if (c.connector == null && c.connectorCustomizer == null) {
                    return reject(new Error('Connector not found. Did you export it?'))
                }
                if (c.connector != null) {
                    return await c.connector._exec(
                        cmd.type,
                        { version: cmd.version, commandType: cmd.type },
                        cmd.input,
                        out,
                        c.connectorCustomizer
                    )
                }
                const output = await c.connectorCustomizer._exec(
                    cmd.type,
                    { version: cmd.version, commandType: cmd.type },
                    cmd.input,
                    out
                )
                out.write(output)
            } catch (e) {
                reject(e)
            } finally {
                out.end()
            }
        })
        res.status(200)
    })
}

const app = express()

app.post('/', (req, res, next) => {
    const contentType = req.headers['content-type'] || ''
    if (contentType.includes('text/plain')) {
        return express.text({ limit: '10mb', type: 'text/plain' })(req, res, next)
    }
    return express.json({ strict: true, limit: '10mb' })(req, res, next)
})

app.post('/', async (req, res) => {
    try {
        if (typeof req.body === 'string') {
            // On a proxy server, external logs are appended in-process during forwarded JSON ops.
            // Plain-text POSTs are misrouted HTTP fallbacks — acknowledge but do not write proxy-ingest.
            if (process.env.PROXY_PASSWORD !== undefined) {
                res.status(200).json({ success: true, ignored: 'proxy-server-disk-logging' })
                return
            }
            if (req.body.trim()) {
                const baseurl = req.headers[FUSION_BASEURL_HEADER]
                appendPlainLog(req.body.trim(), typeof baseurl === 'string' ? baseurl : undefined)
            }
            res.status(200).json({ success: true })
            return
        }

        const cmd = req.body
        if (!cmd || typeof cmd !== 'object' || cmd.config == null) {
            res.status(400).json({
                error: 'Expected JSON body with type, input, and config fields for connector commands',
            })
            return
        }

        await runConnectorCommand(cmd, res)
    } catch (e) {
        console.error(typeof e === 'string' ? e : e?.message)
        let errorType = ConnectorErrorType.Generic
        if (e instanceof ConnectorError) {
            errorType = e.type
        }
        res.status(500).write(`${errorType} error: \n + ${util.inspect(e)}`)
    } finally {
        res.end()
    }
})

app.listen(port, () => {
    console.log(`Identity Fusion proxy server listening at http://localhost:${port}`)
    console.log(`Connector: ${connectorPath}`)
    console.log(
        `External log path: ${process.env.LOG_FILE ? path.resolve(process.env.LOG_FILE) : path.resolve('logs/<tenant>/fusion-YYYYMMDD.log')}`
    )
    if (process.env.PROXY_PASSWORD !== undefined) {
        console.log('Proxy server mode: PROXY_PASSWORD is set (disk external logging during forwarded ops)')
    } else {
        console.warn('Warning: PROXY_PASSWORD is not set — external logging may HTTP POST instead of writing under logs/<tenant>/')
    }
})
