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
    sourceName: string
    name?: string
    disabled?: boolean
    attributes?: Record<string, unknown>
    identity?: { id: string; name: string }
    sourceOwner?: { id: string; name: string }
}

export interface ChainFusionAccount {
    nativeIdentity: string
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
    private stepResults: Map<string, StepResult> = new Map()
    private passIndex = 0

    constructor(initialState?: ChainStateSnapshot) {
        this.state = initialState ?? {
            identities: [],
            managedAccounts: {},
            fusionAccounts: [],
            forms: [],
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

    getManagedAccounts(pass?: number): ChainManagedAccount[] {
        const key = pass ? `pass${pass}` : this.activePassKey()
        return this.state.managedAccounts[key] ?? []
    }

    private activePassKey(): string {
        return `pass${this.passIndex || 1}`
    }

    setPassIndex(index: number): void {
        this.passIndex = index
    }

    getPassIndex(): number {
        return this.passIndex
    }

    getFusionAccounts(): ChainFusionAccount[] {
        return this.state.fusionAccounts
    }

    getFusionAccount(nativeIdentity: string): ChainFusionAccount | undefined {
        return this.state.fusionAccounts.find((a) => a.nativeIdentity === nativeIdentity)
    }

    addFusionAccount(account: ChainFusionAccount): void {
        const existing = this.state.fusionAccounts.find((a) => a.nativeIdentity === account.nativeIdentity)
        if (existing) {
            Object.assign(existing, account)
        } else {
            this.state.fusionAccounts.push(account)
        }
    }

    updateFusionAccount(nativeIdentity: string, updates: Partial<ChainFusionAccount>): void {
        const account = this.state.fusionAccounts.find((a) => a.nativeIdentity === nativeIdentity)
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
        this.stepResults.set(result.stepId, result)
    }

    getStepResult(stepId: string): StepResult | undefined {
        return this.stepResults.get(stepId)
    }

    getAllStepResults(): StepResult[] {
        return Array.from(this.stepResults.values())
    }

    applyDelta(delta: Record<string, unknown>): void {
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

    toJSON(): ChainStateSnapshot {
        return this.state
    }

    writeToFile(filePath: string): void {
        fs.writeFileSync(filePath, JSON.stringify(this.state, null, 2) + '\n')
    }
}
