import * as fs from 'fs'
import * as path from 'path'

export interface ChainIdentity {
    id: string
    name: string
    attributes?: Record<string, unknown>
    accounts?: Array<{
        source?: { id: string; name: string }
        accountId?: string
        nativeIdentity?: string
    }>
}

export interface ChainManagedAccount {
    id: string
    nativeIdentity?: string
    sourceId?: string
    sourceName: string
    name?: string
    disabled?: boolean
    attributes?: Record<string, unknown>
    identity?: { id: string; name: string }
    identityId?: string
    sourceOwner?: { id: string; name: string }
}

export interface ChainFusionAccount {
    managedKey: string
    identityId?: string
    name?: string
    displayName?: string
    disabled?: boolean
    attributes?: Record<string, unknown>
    statuses?: string[]
    actions?: string[]
    reviews?: string[]
    sources?: string[]
    accountIds?: string[]
}

export interface ChainStateSnapshot {
    identities: ChainIdentity[]
    managedAccounts: Record<string, ChainManagedAccount[]>
    fusionAccounts: ChainFusionAccount[]
    forms: Array<Record<string, unknown>>
    finishedFusionDecisions?: Array<Record<string, unknown>>
    [key: string]: unknown
}

export interface StepResult {
    stepId: string
    operation: string
    success: boolean
    output: unknown
    stateDelta: Record<string, unknown>
    duration: number
    error?: string
}

export class ChainState {
    private state: ChainStateSnapshot
    private stepResults: StepResult[] = []
    private sweepIndex = 0
    /** Live ServiceRegistry reused across chain replay steps (not part of snapshots). */
    private serviceRegistry: unknown

    constructor(initialState?: ChainStateSnapshot) {
        this.state = initialState ?? {
            identities: [],
            managedAccounts: {},
            fusionAccounts: [],
            forms: [],
            finishedFusionDecisions: [],
        }
    }

    static fromFile(filePath: string): ChainState {
        const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'))
        return new ChainState(raw.initialState ?? {})
    }

    getSnapshot(): Readonly<ChainStateSnapshot> {
        return this.state
    }

    getIdentities(): ChainIdentity[] {
        return this.state.identities
    }

    getIdentityById(id: string): ChainIdentity | undefined {
        return this.state.identities.find((i) => i.id === id)
    }

    getIdentityByName(name: string): ChainIdentity | undefined {
        return this.state.identities.find((i) => i.name === name)
    }

    addIdentity(identity: ChainIdentity): void {
        const existing = this.state.identities.find((i) => i.id === identity.id)
        if (existing) {
            Object.assign(existing, identity)
        } else {
            this.state.identities.push(identity)
        }
    }

    getManagedAccounts(sweep?: number): ChainManagedAccount[] {
        const stateAccounts = this.state.managedAccounts
        if (Array.isArray(stateAccounts)) {
            return stateAccounts as unknown as ChainManagedAccount[]
        }
        const key = sweep ? `sweep${sweep}` : this.activeSweepKey()
        return stateAccounts[key] ?? []
    }

    private activeSweepKey(): string {
        return `sweep${this.sweepIndex || 1}`
    }

    setSweepIndex(index: number): void {
        this.sweepIndex = index
    }

    getSweepIndex(): number {
        return this.sweepIndex
    }

    getServiceRegistry<T = unknown>(): T | undefined {
        return this.serviceRegistry as T | undefined
    }

    setServiceRegistry(registry: unknown): void {
        this.serviceRegistry = registry
    }

    getFusionAccounts(): ChainFusionAccount[] {
        return this.state.fusionAccounts
    }

    getFusionAccount(managedKey: string): ChainFusionAccount | undefined {
        return this.state.fusionAccounts.find((a) => a.managedKey === managedKey)
    }

    addFusionAccount(account: ChainFusionAccount): void {
        const existing = this.state.fusionAccounts.find((a) => a.managedKey === account.managedKey)
        if (existing) {
            Object.assign(existing, account)
        } else {
            this.state.fusionAccounts.push(account)
        }
    }

    updateFusionAccount(managedKey: string, updates: Partial<ChainFusionAccount>): void {
        const account = this.state.fusionAccounts.find((a) => a.managedKey === managedKey)
        if (account) {
            Object.assign(account, updates)
        }
    }

    getForms(): Array<Record<string, unknown>> {
        return this.state.forms
    }

    addForm(form: Record<string, unknown>): void {
        this.state.forms.push(form)
    }

    recordStepResult(result: StepResult): void {
        this.stepResults.push(result)
    }

    getStepResult(stepId: string): StepResult | undefined {
        return this.stepResults.find((r) => r.stepId === stepId)
    }

    getAllStepResults(): StepResult[] {
        return this.stepResults
    }

    applyDelta(delta: Record<string, unknown>): void {
        if ('identities' in delta) {
            const identities = delta.identities as ChainIdentity[]
            if (Array.isArray(identities)) {
                for (const identity of identities) {
                    this.addIdentity(identity)
                }
            }
        }
        if ('managedAccounts' in delta) {
            const ma = delta.managedAccounts
            if (Array.isArray(ma)) {
                const stateAccounts = this.state.managedAccounts
                if (Array.isArray(stateAccounts)) {
                    for (const account of ma) {
                        this.addOrUpdateManagedAccount(account, stateAccounts as unknown as ChainManagedAccount[])
                    }
                } else {
                    const key = this.activeSweepKey()
                    if (!stateAccounts[key]) {
                        stateAccounts[key] = []
                    }
                    for (const account of ma) {
                        this.addOrUpdateManagedAccount(account, stateAccounts[key])
                    }
                }
            } else if (ma && typeof ma === 'object') {
                const stateAccounts = this.state.managedAccounts
                if (Array.isArray(stateAccounts)) {
                    for (const sweepAccounts of Object.values(ma as Record<string, ChainManagedAccount[]>)) {
                        for (const account of sweepAccounts) {
                            this.addOrUpdateManagedAccount(account, stateAccounts as unknown as ChainManagedAccount[])
                        }
                    }
                } else {
                    for (const [key, sweepAccounts] of Object.entries(ma as Record<string, ChainManagedAccount[]>)) {
                        if (!stateAccounts[key]) {
                            stateAccounts[key] = []
                        }
                        for (const account of sweepAccounts) {
                            this.addOrUpdateManagedAccount(account, stateAccounts[key])
                        }
                    }
                }
            }
        }
        if ('fusionAccounts' in delta) {
            const fusionAccounts = delta.fusionAccounts as ChainFusionAccount[]
            if (Array.isArray(fusionAccounts)) {
                for (const account of fusionAccounts) {
                    this.addFusionAccount(account)
                }
            }
        }
        if ('fusionIdentityDecisions' in delta) {
            const forms = delta.fusionIdentityDecisions as Array<Record<string, unknown>>
            if (Array.isArray(forms)) {
                for (const form of forms) {
                    const existingIndex = this.state.forms.findIndex((f) => f.id === form.id)
                    if (existingIndex >= 0) {
                        this.state.forms[existingIndex] = { ...this.state.forms[existingIndex], ...form }
                    } else {
                        this.state.forms.push(form)
                    }
                }
            }
        }
        if ('finishedFusionDecisions' in delta) {
            const decisions = delta.finishedFusionDecisions as Array<Record<string, unknown>>
            if (Array.isArray(decisions)) {
                if (!this.state.finishedFusionDecisions) {
                    this.state.finishedFusionDecisions = []
                }
                for (const decision of decisions) {
                    const accountId = (decision.account as { id?: string } | undefined)?.id
                    const existingIndex = this.state.finishedFusionDecisions.findIndex(
                        (d) => (d.account as { id?: string } | undefined)?.id === accountId
                    )
                    if (existingIndex >= 0) {
                        this.state.finishedFusionDecisions[existingIndex] = {
                            ...this.state.finishedFusionDecisions[existingIndex],
                            ...decision,
                        }
                    } else {
                        this.state.finishedFusionDecisions.push(decision)
                    }
                }
            }
        }

        // Additive deltas used by manual scenarios
        const fusionAdd = delta.fusionAccountsAdd as ChainFusionAccount[] | undefined
        if (fusionAdd) {
            for (const account of fusionAdd) {
                this.addFusionAccount(account)
            }
        }

        const identityAdd = delta.identitiesAdd as ChainIdentity[] | undefined
        if (identityAdd) {
            for (const identity of identityAdd) {
                this.addIdentity(identity)
            }
        }
    }

    private addOrUpdateManagedAccount(account: ChainManagedAccount, array: ChainManagedAccount[]): void {
        const existing = array.find((a) => {
            if (account.id && a.id === account.id) {
                return true
            }
            const aSource = a.sourceId || a.sourceName
            const accSource = account.sourceId || account.sourceName
            if (aSource && accSource && aSource === accSource && a.nativeIdentity === account.nativeIdentity) {
                return true
            }
            return false
        })
        if (existing) {
            Object.assign(existing, account)
        } else {
            array.push(account)
        }
    }

    toJSON(): ChainStateSnapshot {
        return this.state
    }

    writeToFile(filePath: string): void {
        fs.writeFileSync(filePath, JSON.stringify(this.state, null, 2) + '\n')
    }
}

