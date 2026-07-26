import { Configuration } from 'sailpoint-api-client'
import * as fs from 'fs'
import { IscApiAdapter } from './iscApiAdapter'
import { ApiLogEntry } from './recordingApiAdapter'
import { ConnectorError } from '@sailpoint/connector-sdk'
import { isWriteMethod, stableApiCallKey } from './apiWriteClassification'

function stableKey(apiName: string, method: string, args: unknown[]): string {
    return stableApiCallKey(apiName, method, args)
}

export class ReplayApiAdapter implements IscApiAdapter {
    public readonly config: Configuration
    private readonly responseMap = new Map<string, unknown>()
    private readonly writeLog: ApiLogEntry[] = []
    private readonly consumedWrites = new Set<number>()

    constructor(entries: ApiLogEntry[], config?: Configuration) {
        this.config = config ?? ({} as Configuration)

        for (const entry of entries) {
            const key = stableKey(entry.api, entry.method, entry.args)
            if (isWriteMethod(entry.method)) {
                this.writeLog.push(entry)
            } else {
                this.responseMap.set(key, entry.response)
            }
        }
    }

    private createApiProxy(apiName: string): Record<string, unknown> {
        return new Proxy(
            {} as Record<string, unknown>,
            {
                get: (_target: unknown, method: string): unknown => {
                    return (...args: unknown[]) => {
                        const key = stableKey(apiName, method, args)

                        if (isWriteMethod(method)) {
                            const idx = this.writeLog.findIndex(
                                (e, i) =>
                                    e.api === apiName &&
                                    e.method === method &&
                                    stableKey(e.api, e.method, e.args as unknown[]) === key &&
                                    !this.consumedWrites.has(i)
                            )
                            if (idx === -1) {
                                throw new ConnectorError(
                                    `Replay: unrecorded write call: ${apiName}.${method}(${JSON.stringify(args)})`
                                )
                            }
                            this.consumedWrites.add(idx)
                            return this.writeLog[idx].response
                        }

                        const response = this.responseMap.get(key)
                        if (response === undefined) {
                            throw new ConnectorError(
                                `Replay: unrecorded API call: ${apiName}.${method}(${JSON.stringify(args)})`
                            )
                        }
                        return response
                    }
                },
            }
        ) as Record<string, unknown>
    }

    get accountsApi() { return this.createApiProxy('accounts') as any }
    get identitiesApi() { return this.createApiProxy('identities') as any }
    get searchApi() { return this.createApiProxy('search') as any }
    get sourcesApi() { return this.createApiProxy('sources') as any }
    get customFormsApi() { return this.createApiProxy('customForms') as any }
    get workflowsApi() { return this.createApiProxy('workflows') as any }
    get entitlementsApi() { return this.createApiProxy('entitlements') as any }
    get transformsApi() { return this.createApiProxy('transforms') as any }
    get governanceGroupsApi() { return this.createApiProxy('governanceGroups') as any }
    get taskManagementApi() { return this.createApiProxy('taskManagement') as any }
    get identityProfilesApi() { return this.createApiProxy('identityProfiles') as any }
    get identityAttributesApi() { return this.createApiProxy('identityAttributes') as any }
}

export function loadApiLog(filePath: string): ApiLogEntry[] {
    if (!fs.existsSync(filePath)) return []
    const content = fs.readFileSync(filePath, 'utf-8').trim()
    if (!content) return []
    return content.split('\n').map((line) => JSON.parse(line))
}

