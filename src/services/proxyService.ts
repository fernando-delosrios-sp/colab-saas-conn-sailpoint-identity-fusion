import { ConnectorError, Response } from '@sailpoint/connector-sdk'
import { FusionConfig } from '../model/config'
import { LogService } from './logService'
import { assert } from 'console'

const DEFAULT_PROXY_REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const MAX_PROXY_REDIRECTS = 8

const unwrapData = (obj: any, log: LogService): any => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj
    }

    if ('data' in obj && typeof obj.data === 'object' && obj.data !== null) {
        log.debug(`Unwrapping data field. Object keys: ${Object.keys(obj).join(', ')}`)
        const unwrapped = obj.data
        return unwrapData(unwrapped, log)
    }

    return obj
}

const isValidObject = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return false
    }
    return Object.keys(obj).length > 0
}

const contentTypeOf = (response: globalThis.Response): string => response.headers.get('content-type') ?? ''

const looksLikeHtml = (text: string, contentType: string): boolean => {
    if (/text\/html/i.test(contentType)) {
        return true
    }
    const start = text.trimStart().slice(0, 32).toLowerCase()
    return start.startsWith('<!doctype html') || start.startsWith('<html')
}

const htmlProxyError = (proxyUrl: string, status: number, contentType: string, body: string): ConnectorError =>
    new ConnectorError(
        `Proxy at ${proxyUrl} returned HTML instead of a JSON stream (HTTP ${status}, Content-Type: ${contentType || 'none'}). ` +
            'A reverse proxy such as Caddy does this when it buffers/times out NDJSON, serves a site page, or turns POST into GET via redirect. ' +
            `Snippet: ${body.trim().slice(0, 120)}`
    )

const stripSseLine = (line: string): string => {
    const trimmed = line.trim()
    if (trimmed.toLowerCase().startsWith('data:')) {
        return trimmed.slice(5).trim()
    }
    return trimmed
}

const isRedirectStatus = (status: number): boolean => status >= 300 && status < 400

/**
 * fetch() follows 301/302/303 by converting POST to GET, which returns Caddy/file-server HTML.
 * Replay POST for 301/302/307/308 instead, and stay on the original host.
 */
const postPreservingRedirects = async (
    proxyUrl: string,
    init: RequestInit,
    log: LogService
): Promise<globalThis.Response> => {
    const originalHost = new URL(proxyUrl).host
    let url = proxyUrl

    for (let hop = 0; hop < MAX_PROXY_REDIRECTS; hop++) {
        const response = await fetch(url, { ...init, redirect: 'manual' })
        if (!isRedirectStatus(response.status)) {
            return response
        }

        const location = response.headers.get('location')
        await response.arrayBuffer().catch(() => undefined)
        if (!location) {
            throw new ConnectorError(`Proxy at ${url} returned redirect ${response.status} without a Location header`)
        }

        const next = new URL(location, url)
        if (next.host !== originalHost) {
            throw new ConnectorError(`Proxy redirect to a different host was blocked: ${originalHost} -> ${next.host}`)
        }
        if (response.status === 303) {
            throw new ConnectorError(
                `Proxy at ${url} issued 303 to ${next.toString()}, which would change the POST stream into a GET page load`
            )
        }

        log.debug(`Following proxy redirect ${response.status} to ${next.toString()}`)
        url = next.toString()
    }

    throw new ConnectorError(`Proxy at ${proxyUrl} exceeded ${MAX_PROXY_REDIRECTS} redirects`)
}

const sendParsedRecord = (parsed: any, res: Response<any>, log: LogService): boolean => {
    if (parsed === null || parsed === undefined) {
        return false
    }

    if (typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.type === 'string') {
        if (parsed.type === 'keepAlive') {
            return false
        }
        if (parsed.type === 'state') {
            res.saveState(parsed.data)
            return false
        }
        if (parsed.type === 'config') {
            return false
        }
    }

    const unwrapped = unwrapData(parsed, log)
    if (!isValidObject(unwrapped)) {
        log.debug('Skipping empty NDJSON object')
        return false
    }

    log.debug(`Sending object: ${JSON.stringify(unwrapped).substring(0, 200)}`)
    res.send(unwrapped)
    return true
}

/**
 * Proxy service for forwarding connector operations to an external proxy server
 * and determining proxy run mode based on configuration.
 */
export class ProxyService {
    constructor(
        private config: FusionConfig,
        private log: LogService,
        private res: Response<any>,
        private commandType?: string
    ) {}

    /**
     * Proxy Client Mode: returns true when the connector should forward requests
     * to an external proxy server.
     */
    isProxyMode(): boolean {
        const proxyEnabled = this.config.proxyEnabled ?? false
        const hasProxyUrl = this.config.proxyUrl !== undefined && this.config.proxyUrl !== ''
        const isServer = process.env.PROXY_PASSWORD !== undefined
        const isAlreadyProxyRequest = this.config.isProxy === true

        return proxyEnabled && hasProxyUrl && !isServer && !isAlreadyProxyRequest
    }

    /**
     * Proxy Server Mode: returns true when the connector is acting as the proxy
     * server that receives and processes forwarded requests.
     */
    isProxyService(): boolean {
        const proxyEnabled = this.config.proxyEnabled ?? false
        const hasProxyPassword = process.env.PROXY_PASSWORD !== undefined

        if (proxyEnabled && hasProxyPassword) {
            this.log.info('Running as proxy server')
            if (this.config.proxyPassword) {
                const serverPassword = process.env.PROXY_PASSWORD
                const clientPassword = this.config.proxyPassword
                assert(serverPassword === clientPassword, 'Proxy password mismatch')
            }
            return true
        } else {
            return false
        }
    }

    /**
     * Forwards the current operation to the configured proxy server, parses the
     * response (JSON array or NDJSON), and sends each result via `res.send()`.
     *
     * @param input - The SDK input payload for the current operation
     */
    async execute(input: any): Promise<void> {
        try {
            if (!this.config.proxyEnabled || !this.config.proxyUrl) {
                throw new ConnectorError('Proxy mode is not enabled or proxy URL is missing')
            }
            const { proxyUrl } = this.config
            const externalConfig = { ...this.config, isProxy: true }
            const body = {
                type: this.commandType,
                input,
                config: externalConfig,
            }
            const proxyRequestTimeoutMs = this.config.proxyRequestTimeoutMs ?? DEFAULT_PROXY_REQUEST_TIMEOUT_MS
            const controller = new AbortController()
            const timeout = setTimeout(() => {
                controller.abort()
            }, proxyRequestTimeoutMs)
            let response: globalThis.Response
            try {
                response = await postPreservingRedirects(
                    proxyUrl,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/x-ndjson, application/json, text/event-stream',
                        },
                        body: JSON.stringify(body),
                        signal: controller.signal,
                    },
                    this.log
                )
            } catch (fetchError) {
                if (fetchError instanceof ConnectorError) {
                    throw fetchError
                }
                if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                    throw new ConnectorError(`Proxy request to ${proxyUrl} timed out after ${proxyRequestTimeoutMs} ms`)
                }
                this.log.error(
                    `Proxy fetch failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown fetch error'}`
                )
                throw new ConnectorError(
                    `Failed to connect to proxy server at ${proxyUrl}: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`
                )
            } finally {
                clearTimeout(timeout)
            }

            const contentType = contentTypeOf(response)
            const data = await response.text()

            if (looksLikeHtml(data, contentType)) {
                throw htmlProxyError(proxyUrl, response.status, contentType, data || response.statusText)
            }

            if (!response.ok) {
                throw new ConnectorError(
                    `Proxy server returned error status ${response.status}: ${data || response.statusText}`
                )
            }

            if (!data || data.trim().length === 0) {
                this.log.debug('Proxy received empty response')
                return
            }

            this.log.debug(
                `Proxy received response (${data.length} chars): ${data.substring(0, 500)}${data.length > 500 ? '...' : ''}`
            )

            const lines = data
                .split('\n')
                .map(stripSseLine)
                .filter((line) => line.length > 0 && !line.startsWith(':'))
            this.log.debug(`Processing ${lines.length} non-empty lines from proxy response`)

            if (lines.length === 0) {
                this.log.debug('Proxy received response with no valid content')
                return
            }

            if (lines.length === 1) {
                try {
                    let parsed = JSON.parse(lines[0])

                    if (parsed === null || parsed === undefined) {
                        this.log.debug('Proxy received null/undefined response')
                        return
                    }

                    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                        this.log.debug(`Before unwrap - parsed keys: ${Object.keys(parsed).join(', ')}`)
                    }
                    parsed = unwrapData(parsed, this.log)
                    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                        this.log.debug(`After unwrap - parsed keys: ${Object.keys(parsed).join(', ')}`)
                    }

                    if (Array.isArray(parsed)) {
                        if (parsed.length === 0) {
                            this.log.debug('Proxy received empty array')
                            return
                        }
                        this.log.info(`Proxy received JSON array with ${parsed.length} items`)
                        let sentCount = 0
                        for (const item of parsed) {
                            const unwrappedItem = unwrapData(item, this.log)

                            if (!isValidObject(unwrappedItem)) {
                                this.log.debug(`Skipping empty object in array`)
                                continue
                            }

                            this.log.debug(`Sending item: ${JSON.stringify(unwrappedItem).substring(0, 200)}`)
                            this.res.send(unwrappedItem)
                            sentCount++
                        }
                        this.log.info(`Proxy sent ${sentCount} valid objects from array`)
                        return
                    } else {
                        if (parsed === null || parsed === undefined) {
                            this.log.debug(`Skipping null/undefined single object`)
                            return
                        }

                        this.log.debug(`Sending single object: ${JSON.stringify(parsed).substring(0, 200)}`)
                        this.res.send(parsed)
                        return
                    }
                } catch {
                    this.log.warn('Failed to parse response as JSON array, trying NDJSON')
                }
            }

            let validObjectCount = 0
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line)
                    if (sendParsedRecord(parsed, this.res, this.log)) {
                        validObjectCount++
                    }
                } catch (parseError) {
                    if (looksLikeHtml(line, '')) {
                        throw htmlProxyError(proxyUrl, response.status, contentType, line)
                    }
                    this.log.error(`Failed to parse line: ${line.substring(0, 200)}`)
                    throw new ConnectorError(
                        `Failed to parse JSON line from proxy response: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}. Line: ${line.substring(0, 100)}`
                    )
                }
            }

            this.log.info(`Proxy sent ${validObjectCount} valid objects to ISC`)
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(`Proxy operation failed: ${detail}`)
        }
    }
}
