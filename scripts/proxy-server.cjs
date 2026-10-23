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
const { assertProxyCommandAuthorized, describeProxyAuthContext } = require('./proxyPassword.cjs')

loadDotEnv(path.join(__dirname, '..'))

if (process.env.LOG_FILE && isDeprecatedIngestLogPath(process.env.LOG_FILE)) {
    console.warn(
        'Ignoring deprecated LOG_FILE=logs/proxy-ingest.log — external logs use logs/<tenant>/fusion-YYYYMMDD.log'
    )
    delete process.env.LOG_FILE
}

const COMMAND_RUN = 'run'
/**
 * Keep-alive cadence for the forwarded NDJSON response. ISC's proxy client splits
 * the body on newlines and ignores empty lines, so a bare newline keeps NAT /
 * undici body timers alive during long silent stretches of aggregation.
 */
const HEARTBEAT_INTERVAL_MS = 30_000
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
        .spawn(
            /^win/.test(process.platform) ? 'tsc.cmd' : 'tsc',
            ['--inlineSourcemap', 'true', '--sourceMap', 'false', '--watch'],
            {
                shell: true,
            }
        )
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
    // Send the response headers up front. Otherwise Express waits for the first
    // account line, and ISC's fetch sits in "waiting for headers" until it dies
    // (around 5 minutes) when aggregation is slow to produce output.
    res.status(200)
    res.type('application/x-ndjson')
    res.flushHeaders()

    await _withConfig(cmd.config, async () => {
        const c = await loadConnector(connectorPath)

        // Route connector NDJSON and keep-alive heartbeats through a single
        // PassThrough so the two producers never write to `res` concurrently.
        const gate = new stream.PassThrough()
        const out = new stream.Transform({
            writableObjectMode: true,
            transform(chunk, encoding, callback) {
                try {
                    gate.write(`${JSON.stringify(chunk)}\n`)
                } catch (e) {
                    callback(e)
                    return
                }
                callback()
            },
        })

        stream.pipeline(gate, res, (err) => {
            if (err) {
                console.error(err)
            }
        })

        const heartbeat = setInterval(() => gate.write('\n'), HEARTBEAT_INTERVAL_MS)

        try {
            await new Promise((resolve, reject) => {
                out.on('finish', () => resolve())
                out.on('error', (e) => reject(e))

                const runConnector = async () => {
                    try {
                        if (c.connector == null && c.connectorCustomizer == null) {
                            throw new Error('Connector not found. Did you export it?')
                        }
                        if (c.connector != null) {
                            await c.connector._exec(
                                cmd.type,
                                { version: cmd.version, commandType: cmd.type },
                                cmd.input,
                                out,
                                c.connectorCustomizer
                            )
                            return
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
                }

                void runConnector()
            })
            gate.end()
        } finally {
            clearInterval(heartbeat)
        }
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
    let cmd
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

        cmd = req.body
        if (!cmd || typeof cmd !== 'object' || cmd.config == null) {
            res.status(400).json({
                error: 'Expected JSON body with type, input, and config fields for connector commands',
            })
            return
        }

        const authContext = describeProxyAuthContext(cmd.config)
        console.log(`[proxy-server] Incoming operation: ${cmd.type ?? 'unknown'} auth=${JSON.stringify(authContext)}`)

        assertProxyCommandAuthorized(cmd.config)
        console.log(`[proxy-server] Accepted forwarded operation: ${cmd.type ?? 'unknown'}`)

        await runConnectorCommand(cmd, res)
    } catch (e) {
        const message = typeof e === 'string' ? e : e?.message
        const operationLabel = cmd?.type ? ` (${cmd.type})` : ''
        console.error(`[proxy-server] Rejected forwarded operation${operationLabel}: ${message}`)
        console.log(`[proxy-server] Rejected forwarded operation${operationLabel}: ${message}`)
        if (res.headersSent) {
            // The connector command already flushed its 200 headers; report the late
            // failure in-band instead of rewriting an already-sent status line.
            res.write(`${ConnectorErrorType.Generic} error: \n + ${util.inspect(e)}`)
            return
        }
        if (e instanceof Error && e.message === 'Proxy password mismatch') {
            res.status(401).json({ error: e.message })
            return
        }
        if (e instanceof Error && e.message.includes('PROXY_PASSWORD environment variable is not set')) {
            res.status(500).json({ error: e.message })
            return
        }
        let errorType = ConnectorErrorType.Generic
        if (e instanceof ConnectorError) {
            errorType = e.type
        }
        res.status(500).write(`${errorType} error: \n + ${util.inspect(e)}`)
    } finally {
        res.end()
    }
})

const server = app.listen(port, () => {
    console.log(`Identity Fusion proxy server listening at http://localhost:${port}`)
    console.log(`Connector: ${connectorPath}`)
    console.log(
        `External log path: ${process.env.LOG_FILE ? path.resolve(process.env.LOG_FILE) : path.resolve('logs/<tenant>/fusion-YYYYMMDD.log')}`
    )
    if (process.env.PROXY_PASSWORD !== undefined) {
        console.log('[proxy-server] PROXY_PASSWORD loaded from environment')
    } else {
        console.warn(
            '[proxy-server] PROXY_PASSWORD is NOT SET — add it to the repo-root .env file (or export it) and restart'
        )
    }
})

// Long-running aggregation can sit silent for hours. Node 18+ defaults
// requestTimeout to 300000 ms, which would cut a forwarded command short, so
// disable the server-side socket/header/request timeouts.
server.requestTimeout = 0
server.headersTimeout = 0
server.timeout = 0
