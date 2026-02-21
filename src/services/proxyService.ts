import { ConnectorError, Response } from '@sailpoint/connector-sdk'
import { FusionConfig } from '../model/config'
import { LogService } from './logService'
import { assert } from 'console'

const KEEPALIVE = 2.5 * 60 * 1000

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

        return (proxyEnabled && hasProxyUrl && !isServer) || (this.config.isProxy === true)
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
        const interval = setInterval(() => {
            this.res.keepAlive()
        }, KEEPALIVE)
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
            let response: globalThis.Response
            try {
                response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                })
            } catch (fetchError) {
                this.log.error(`Proxy fetch failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown fetch error'}`)
                throw new ConnectorError(
                    `Failed to connect to proxy server at ${proxyUrl}: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`
                )
            }

            if (!response.ok) {
                const errorText = await response.text()
                throw new ConnectorError(
                    `Proxy server returned error status ${response.status}: ${errorText || response.statusText}`
                )
            }

            const data = await response.text()

            if (!data || data.trim().length === 0) {
                this.log.debug('Proxy received empty response')
                return
            }

            this.log.debug(`Proxy received response (${data.length} chars): ${data.substring(0, 500)}${data.length > 500 ? '...' : ''}`)

            const lines = data.split('\n').filter(line => line.trim().length > 0)
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
                    let parsed = JSON.parse(line)

                    parsed = unwrapData(parsed, this.log)

                    if (!isValidObject(parsed)) {
                        this.log.debug(`Skipping empty NDJSON object`)
                        continue
                    }

                    this.log.debug(`Sending object: ${JSON.stringify(parsed).substring(0, 200)}`)
                    this.res.send(parsed)
                    validObjectCount++
                } catch (parseError) {
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
        } finally {
            clearInterval(interval)
        }
    }
}
