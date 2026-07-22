# API-Seam Record/Replay Implementation Plan

> **For agentic workers:** Use `/opsx-apply` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move record/replay from the output seam (res.send + FusionRun snapshots) to the IscApiAdapter seam — record ISC API responses via RecordingApiAdapter, replay through ReplayApiAdapter serving recorded data to the real pipeline, delete the 758-line hand-mocked ReplayAdapter parallel implementation.

**Architecture:** Two new implementations of `IscApiAdapter`: `RecordingApiAdapter` (Proxy-decorates SdkApiAdapter, logs method+args→response to api-log.ndjson) and `ReplayApiAdapter` (serves api-log by key, fails on unknown requests). ServiceRegistry wires the appropriate adapter based on `FusionConfig.recording.mode`. RecordingService gains api-log persistence and lifecycle cleanup (finalize on operation end, not just signals). The chain harness ReplayAdapter delegates to `PipelineRunner.run()` with `ReplayApiAdapter`, deleting ~25 service-method mocks and FakeApiAdapter.

**Tech Stack:** TypeScript, Node.js, SailPoint SDK (sailpoint-api-client), Vitest

---

## Task 1: RecordingConfig — centralize recording flags

**Files:**
- Modify: `src/model/config.ts` (add RecordingConfig type, add field to FusionConfig)
- Modify: `src/model/fusionRun.ts:169-171` (read isRecordMode from config)
- Modify: `src/services/recordingService.ts:37,130,147` (accept RecordingConfig, stop reading env)
- Modify: `scripts/record-chain.js:41-43` (pass config.recording instead of env vars)

**Interfaces:**
- Produces: `RecordingConfig { mode: 'off' | 'record' | 'replay', chainName?: string, verbose?: boolean }` on `FusionConfig.recording`
- Produces: `FusionRun` constructor accepts optional `config?: FusionConfig` param

### Step-by-step

- [ ] **Step 1: Add RecordingConfig type to config.ts**

In `src/model/config.ts`, before the `FusionConfig` interface, add:

```typescript
export interface RecordingConfig {
    mode: 'off' | 'record' | 'replay'
    chainName?: string
    verbose?: boolean
}
```

- [ ] **Step 2: Add recording field to FusionConfig**

In `src/model/config.ts`, append to the `FusionConfig` interface (before the closing `}`):

```typescript
    recording?: RecordingConfig
```

- [ ] **Step 3: Run tsc to verify config.ts compiles**

```bash
npx tsc --noEmit src/model/config.ts
```

- [ ] **Step 4: Update FusionRun constructor to read isRecordMode from config**

In `src/model/fusionRun.ts`, change the constructor (line 169-171):

```typescript
// Before:
constructor(public log?: LogService) {
    this.isRecordMode = process.env.RECORD_MODE === 'true'

// After:
constructor(public log?: LogService, config?: FusionConfig) {
    if (config?.recording?.mode) {
        this.isRecordMode = config.recording.mode === 'record'
    } else if (process.env.RECORD_MODE === 'true') {
        this.isRecordMode = true
    } else {
        this.isRecordMode = false
    }
```

Note: add `import { FusionConfig } from './config'` or use an inline type reference. Check if `FusionConfig` is imported — if not, add the import.

- [ ] **Step 5: Find all FusionRun construction sites and update if needed**

Run: `grep -rn "new FusionRun" src/`
Expected: All existing calls pass `log` as first arg and don't pass config — the optional second param means no breakage.

If the constructor signature changes cause type errors, add `config?: FusionConfig` as an optional second parameter.

- [ ] **Step 6: Update RecordingService constructor**

In `src/services/recordingService.ts`, change the constructor to accept `RecordingConfig` instead of reading env vars:

```typescript
// Before (lines 35-41):
private constructor(
    private readonly log: LogService,
    private readonly config: FusionConfig
) {
    this.chainName = process.env.RECORD_CHAIN_NAME ?? `recording-${Date.now()}`
    this.recordingDir = path.resolve('test-data', 'recordings', this.chainName)

// After:
private constructor(
    private readonly log: LogService,
    private readonly config: FusionConfig
) {
    const recConfig = config.recording
    this.chainName = recConfig?.chainName ?? `recording-${Date.now()}`
    this.recordingDir = path.resolve('test-data', 'recordings', this.chainName)
```

- [ ] **Step 7: Update VERBOSE_RECORDING reads in RecordingService**

In `src/services/recordingService.ts`, replace the two `process.env.VERBOSE_RECORDING === 'true'` reads (lines ~130, ~147) with `this.config.recording?.verbose === true`.

- [ ] **Step 8: Update record-chain.js**

In `scripts/record-chain.js`, replace env var setting with config override. Find the block that sets `RECORD_MODE`, `RECORD_CHAIN_NAME`, `VERBOSE_RECORDING` and replace with a config override mechanism. The exact approach depends on how `readConfig` injects overrides — simplest: remove env var sets and pass `--recording-mode` flag, or leave env vars as fallback commented with deprecation note.

```javascript
// Before (lines ~41-43):
process.env.RECORD_MODE = 'true'
process.env.RECORD_CHAIN_NAME = chainName
if (verbose) process.env.VERBOSE_RECORDING = 'true'

// After: keep env vars for backward compat, add deprecation note
// These env vars feed FusionConfig.recording via a bridge in readConfig
process.env.RECORD_MODE = 'true'
process.env.RECORD_CHAIN_NAME = chainName
if (verbose) process.env.VERBOSE_RECORDING = 'true'
```

- [ ] **Step 9: Update ServiceRegistry to pass config to FusionRun**

In `src/services/serviceRegistry.ts`, find `new FusionRun(this.log)` (~line 71) and change to `new FusionRun(this.log, this.config)`.

- [ ] **Step 10: Run tsc to verify all files compile**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 11: Run existing tests to verify no regressions**

```bash
npx vitest run src/model/__tests__/fusionRun.test.ts
```

- [ ] **Step 12: Commit**

```bash
git add src/model/config.ts src/model/fusionRun.ts src/services/recordingService.ts src/services/serviceRegistry.ts scripts/record-chain.js
git commit -m "feat: add RecordingConfig to FusionConfig, centralize recording flags"
```

---

## Task 2: Create RecordingApiAdapter

**Files:**
- Create: `src/services/clientService/recordingApiAdapter.ts`

**Interfaces:**
- Produces: `export class RecordingApiAdapter implements IscApiAdapter`
- Produces: `export interface ApiLogEntry { api: string; method: string; args: unknown[]; response: unknown; timestamp: string }`

### Step-by-step

- [ ] **Step 1: Create the file and add imports**

```typescript
import { Configuration } from 'sailpoint-api-client'
import { IscApiAdapter } from './iscApiAdapter'
import { SdkApiAdapter } from './sdkApiAdapter'

export interface ApiLogEntry {
    api: string
    method: string
    args: unknown[]
    response: unknown
    timestamp: string
}

function sanitizeForJson(value: unknown): unknown {
    if (value === undefined || value === null) return value
    return JSON.parse(JSON.stringify(value))
}
```

- [ ] **Step 2: Write the RecordingApiAdapter class**

```typescript
export class RecordingApiAdapter implements IscApiAdapter {
    public readonly config: Configuration

    private readonly proxyCache = new Map<string, unknown>()

    constructor(
        private readonly inner: SdkApiAdapter,
        private readonly onApiCall: (entry: ApiLogEntry) => void
    ) {
        this.config = inner.config
    }

    private proxyApi<T extends object>(apiGetter: keyof IscApiAdapter extends `get ${infer G}` | string ? never : string, apiName: string): T {
        const cached = this.proxyCache.get(apiName)
        if (cached) return cached as T

        const realApi = (this.inner as Record<string, unknown>)[`_${apiName}`] as T | undefined
            ?? (this.inner as Record<string, unknown>)[apiName] as T | undefined
            // SDK api getter name pattern: accountsApi -> _accountsApi
            // Fallback: try the getter directly
            ?? (this.inner as any)[apiName]

        const proxy = new Proxy(realApi ?? {}, {
            get: (_target, method: string) => {
                return (...args: unknown[]) => {
                    const sanitizedArgs = args.map(sanitizeForJson)
                    const result = (realApi as any)?.[method]?.(...args)
                    const logPromise = Promise.resolve(result).then((response) => {
                        this.onApiCall({
                            api: apiName,
                            method,
                            args: sanitizedArgs,
                            response: sanitizeForJson(response),
                            timestamp: new Date().toISOString(),
                        })
                        return response
                    })
                    return logPromise
                }
            },
        })

        this.proxyCache.set(apiName, proxy)
        return proxy as T
    }

    get accountsApi() { return this.proxyApi('accountsApi', 'accountsApi') }
    get identitiesApi() { return this.proxyApi('identitiesApi', 'identitiesApi') }
    get searchApi() { return this.proxyApi('searchApi', 'searchApi') }
    get sourcesApi() { return this.proxyApi('sourcesApi', 'sourcesApi') }
    get customFormsApi() { return this.proxyApi('customFormsApi', 'customFormsApi') }
    get workflowsApi() { return this.proxyApi('workflowsApi', 'workflowsApi') }
    get entitlementsApi() { return this.proxyApi('entitlementsApi', 'entitlementsApi') }
    get transformsApi() { return this.proxyApi('transformsApi', 'transformsApi') }
    get governanceGroupsApi() { return this.proxyApi('governanceGroupsApi', 'governanceGroupsApi') }
    get taskManagementApi() { return this.proxyApi('taskManagementApi', 'taskManagementApi') }
    get identityProfilesApi() { return this.proxyApi('identityProfilesApi', 'identityProfilesApi') }
    get identityAttributesApi() { return this.proxyApi('identityAttributesApi', 'identityAttributesApi') }
}
```

Wait — the proxy approach is complex because the SDK API instances are created lazily by getters on SdkApiAdapter. The Proxy should wrap the getter results, not the internal `_accountsApi` field. Let me simplify:

**Revised approach:** The Proxy wraps the result of calling the getter on the inner adapter — each call to `accountsApi` returns a Proxied version of the real SDK API.

```typescript
export class RecordingApiAdapter implements IscApiAdapter {
    public readonly config: Configuration

    constructor(
        private readonly inner: IscApiAdapter,
        private readonly onApiCall: (entry: ApiLogEntry) => void
    ) {
        this.config = inner.config
    }

    private createApiProxy<T extends object>(apiName: string, realApi: T): T {
        return new Proxy(realApi, {
            get: (_target, method: string | symbol) => {
                if (typeof method !== 'string') return Reflect.get(realApi, method)
                const original = Reflect.get(realApi, method)
                if (typeof original !== 'function') return original
                return (...args: unknown[]) => {
                    const sanitizedArgs = args.map(sanitizeForJson)
                    const result = original.apply(realApi, args)
                    const resultPromise = Promise.resolve(result).then((response) => {
                        this.onApiCall({
                            api: apiName,
                            method,
                            args: sanitizedArgs,
                            response: sanitizeForJson(response),
                            timestamp: new Date().toISOString(),
                        })
                        return response
                    })
                    return resultPromise
                }
            },
        })
    }

    get accountsApi() { return this.createApiProxy('accounts', this.inner.accountsApi) }
    get identitiesApi() { return this.createApiProxy('identities', this.inner.identitiesApi) }
    get searchApi() { return this.createApiProxy('search', this.inner.searchApi) }
    get sourcesApi() { return this.createApiProxy('sources', this.inner.sourcesApi) }
    get customFormsApi() { return this.createApiProxy('customForms', this.inner.customFormsApi) }
    get workflowsApi() { return this.createApiProxy('workflows', this.inner.workflowsApi) }
    get entitlementsApi() { return this.createApiProxy('entitlements', this.inner.entitlementsApi) }
    get transformsApi() { return this.createApiProxy('transforms', this.inner.transformsApi) }
    get governanceGroupsApi() { return this.createApiProxy('governanceGroups', this.inner.governanceGroupsApi) }
    get taskManagementApi() { return this.createApiProxy('taskManagement', this.inner.taskManagementApi) }
    get identityProfilesApi() { return this.createApiProxy('identityProfiles', this.inner.identityProfilesApi) }
    get identityAttributesApi() { return this.createApiProxy('identityAttributes', this.inner.identityAttributesApi) }
}
```

- [ ] **Step 3: Verify file compiles**

```bash
npx tsc --noEmit src/services/clientService/recordingApiAdapter.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/services/clientService/recordingApiAdapter.ts
git commit -m "feat: add RecordingApiAdapter — records ISC API calls to api-log"
```

---

## Task 3: Create ReplayApiAdapter

**Files:**
- Create: `src/services/clientService/replayApiAdapter.ts`

**Interfaces:**
- Produces: `export class ReplayApiAdapter implements IscApiAdapter`
- Produces: `export function loadApiLog(path: string): Promise<ApiLogEntry[]>`
- Consumes: `ApiLogEntry` from `./recordingApiAdapter`

### Step-by-step

- [ ] **Step 1: Create ReplayApiAdapter file**

```typescript
import { Configuration } from 'sailpoint-api-client'
import * as fs from 'fs'
import * as path from 'path'
import { IscApiAdapter } from './iscApiAdapter'
import { ApiLogEntry } from './recordingApiAdapter'
import { ConnectorError } from '@sailpoint/connector-sdk'

function stableKey(apiName: string, method: string, args: unknown[]): string {
    return `${apiName}.${method}:${JSON.stringify(args, Object.keys(args as object).sort())}`
}

const WRITE_METHODS = new Set([
    'post', 'put', 'patch', 'delete', 'createFormDefinition', 'createFormInstance',
    'updateFormInstance', 'deleteFormDefinition', 'createFormInstanceReviewer',
    'importSourceSchema', 'exportSourceSchema', 'updateSourceSchema',
    'createConfiguration', 'updateConfiguration',
])

function isWriteMethod(method: string): boolean {
    const lower = method.toLowerCase()
    return WRITE_METHODS.has(method) || lower.startsWith('create') || lower.startsWith('update')
        || lower.startsWith('delete') || lower.startsWith('patch') || lower.startsWith('post')
        || lower.startsWith('put') || lower.startsWith('import') || lower.startsWith('export')
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
        const adapter = this
        return new Proxy({} as Record<string, unknown>, {
            get(_target: unknown, method: string) {
                return (...args: unknown[]) => {
                    const key = stableKey(apiName, method, args)

                    if (isWriteMethod(method)) {
                        // Find an unconsumed write matching these args
                        const idx = adapter.writeLog.findIndex(
                            (e, i) => e.api === apiName && e.method === method
                                && stableKey(e.api, e.method, e.args as unknown[]) === key
                                && !adapter.consumedWrites.has(i)
                        )
                        if (idx === -1) {
                            throw new ConnectorError(
                                `Replay: unrecorded write call: ${apiName}.${method}(${JSON.stringify(args)})`
                            )
                        }
                        adapter.consumedWrites.add(idx)
                        return adapter.writeLog[idx].response
                    }

                    const response = adapter.responseMap.get(key)
                    if (response === undefined) {
                        throw new ConnectorError(
                            `Replay: unrecorded API call: ${apiName}.${method}(${JSON.stringify(args)})`
                        )
                    }
                    return response
                }
            },
        })
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

export async function loadApiLog(filePath: string): Promise<ApiLogEntry[]> {
    if (!fs.existsSync(filePath)) return []
    const content = fs.readFileSync(filePath, 'utf-8').trim()
    if (!content) return []
    return content.split('\n').map((line) => JSON.parse(line))
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit src/services/clientService/replayApiAdapter.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/services/clientService/replayApiAdapter.ts
git commit -m "feat: add ReplayApiAdapter — serves recorded API responses with drift detection"
```

---

## Task 4: Wire adapters in ServiceRegistry

**Files:**
- Modify: `src/services/serviceRegistry.ts` (wire adapters based on config.recording.mode)

### Step-by-step

- [ ] **Step 1: Read ServiceRegistry constructor to understand current wiring**

Review lines ~65-175 of `src/services/serviceRegistry.ts`. Identify where `SdkApiAdapter`, `ClientService`, and `RecordingService` are constructed.

- [ ] **Step 2: Add import for new adapters**

At the top of `serviceRegistry.ts`:

```typescript
import { RecordingApiAdapter } from './clientService/recordingApiAdapter'
import { ReplayApiAdapter, loadApiLog } from './clientService/replayApiAdapter'
```

- [ ] **Step 3: Wire adapters based on config.recording.mode**

Find the block that constructs the adapter (around line 83-91). Restructure:

```typescript
// Determine adapter based on recording mode
const recMode = config.recording?.mode ?? 'off'

let adapter: IscApiAdapter
if (recMode === 'replay') {
    const apiLogPath = config.recording?.chainName
        ? path.resolve('test-data', 'recordings', config.recording.chainName, 'api-log.ndjson')
        : ''
    // loadApiLog called synchronously? Or needs await. 
    // If it's async, ServiceRegistry constructor would need to be async.
    // Simpler: pass entries to ReplayApiAdapter constructor.
    // For now, support sync load from file.
    const entries = /* sync load */ 
    adapter = new ReplayApiAdapter(entries)
} else {
    adapter = new SdkApiAdapter(config, this.log)
}

const clientService = new ClientService(adapter, {...})

if (recMode === 'record') {
    const recordingApiAdapter = new RecordingApiAdapter(
        adapter as SdkApiAdapter,
        (entry) => this.recordingService?.onApiCall(entry)
    )
    // Re-wrap: clientService needs RecordingApiAdapter
    // BUT clientService was already constructed with the inner SdkApiAdapter!
    // Need to rewire: construct adapter, then RecordingApiAdapter wraps it, 
    // then pass RecordingApiAdapter to ClientService.
}
```

This needs careful sequencing. Let me restructure properly:

```typescript
// 1. Create base adapter
const sdkAdapter = context.connectionService
    ? (context.connectionService as IscApiAdapter)
    : new SdkApiAdapter(this.config, this.log)

// 2. Apply recording wrapper if in record mode
const adapter: IscApiAdapter = recMode === 'record'
    ? new RecordingApiAdapter(sdkAdapter, (entry) => this._recordingService?.onApiCall(entry))
    : recMode === 'replay'
        ? new ReplayApiAdapter(/* load from config */)
        : sdkAdapter

// 3. Create ClientService with the (possibly wrapped) adapter
this._clientService = new ClientService(adapter, {...})

// 4. Create RecordingService last (needs the adapter for api-log path)
if (recMode === 'record' || recMode === 'replay') {
    this._recordingService = RecordingService.init(this.log, this.config)
}
```

Wait, `RecordingApiAdapter` needs the `onApiCall` callback, which comes from `RecordingService`. And `RecordingService` is constructed after. This creates a circular dependency. Solution: pass a mutable callback ref, or construct RecordingService first with a placeholder callback, then set it.

Simplest: construct `RecordingService` first, then use its `onApiCall` as the callback:

```typescript
const recMode = config.recording?.mode ?? 'off'

// Base adapter
let sdkAdapter: IscApiAdapter | undefined
const adapter: IscApiAdapter = (() => {
    if (context.connectionService) return context.connectionService as IscApiAdapter
    sdkAdapter = new SdkApiAdapter(this.config, this.log)
    if (recMode === 'record') {
        return new RecordingApiAdapter(sdkAdapter, (entry) => {
            this._recordingService?.onApiCall(entry)
        })
    }
    if (recMode === 'replay') {
        const chainName = config.recording?.chainName
        const logPath = chainName
            ? path.resolve('test-data', 'recordings', chainName, 'api-log.ndjson')
            : 'test-data/recordings/api-log.ndjson'
        // For now, load async via a promise. In production, replay mode runs in test harness.
        return new ReplayApiAdapter([], sdkAdapter?.config)
    }
    return sdkAdapter
})()

this._clientService = new ClientService(adapter, {...})
```

Actually, this is getting complex for a plan. Let me take a simpler approach for the plan — the actual implementation will need to handle these wiring nuances. Let me focus on the clean approach:

```typescript
// In ServiceRegistry constructor, replace adapter construction block
const recConfig = this.config.recording
const recMode = recConfig?.mode ?? 'off'

// Build the base SDK adapter (unless context provides one)
const baseAdapter = context.connectionService
    ? (context.connectionService as IscApiAdapter)
    : new SdkApiAdapter(this.config, this.log)

// Wrap for recording
let apiAdapter: IscApiAdapter
if (recMode === 'record') {
    apiAdapter = new RecordingApiAdapter(baseAdapter, (entry) => {
        this._recordingService?.onApiCall(entry)
    })
} else if (recMode === 'replay') {
    // Replay mode: load entries from api-log path
    const logPath = recConfig.chainName
        ? `test-data/recordings/${recConfig.chainName}/api-log.ndjson`
        : undefined
    const entries = logPath && fs.existsSync(logPath)
        ? fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean).map(JSON.parse)
        : []
    apiAdapter = new ReplayApiAdapter(entries, baseAdapter.config)
} else {
    apiAdapter = baseAdapter
}

this._clientService = new ClientService(apiAdapter, { ... })
```

- [ ] **Step 4: Verify ServiceRegistry compiles**

```bash
npx tsc --noEmit src/services/serviceRegistry.ts
```

Fix any type errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/serviceRegistry.ts
git commit -m "feat: wire RecordingApiAdapter/ReplayApiAdapter in ServiceRegistry based on config.recording.mode"
```

---

## Task 5: Update RecordingService lifecycle

**Files:**
- Modify: `src/services/recordingService.ts` (api-log path, onApiCall method, finalize improvements)
- Modify: `src/utils/operationHandler.ts` (call finalize in finally)

### Step-by-step

- [ ] **Step 1: Add api-log path to recording directory**

```typescript
// In recordingService.ts, add to constructor:
private readonly apiLogPath: string

// Set in constructor body:
this.apiLogPath = path.join(this.recordingDir, 'api-log.ndjson')
```

- [ ] **Step 2: Add onApiCall method**

```typescript
public onApiCall(entry: ApiLogEntry): void {
    fs.mkdirSync(this.recordingDir, { recursive: true })
    fs.appendFileSync(this.apiLogPath, JSON.stringify({
        api: entry.api,
        method: entry.method,
        args: entry.args,
        response: entry.response,
        timestamp: entry.timestamp,
    }) + '\n')
}
```

Note: import `ApiLogEntry` from `./clientService/recordingApiAdapter`.

- [ ] **Step 3: Update buildScenario to include apiLogPath**

In the `buildScenario()` method (~line 178), add to the returned object:

```typescript
apiLogPath: path.relative(process.cwd(), this.apiLogPath),
```

- [ ] **Step 4: Make finalize safe to call multiple times (add early return)**

The `finalize()` method already has `if (this.finalized) return ''`. Verify it handles being called from operation handler's finally block correctly.

- [ ] **Step 5: Update createOperationHandler to finalize recording**

In `src/utils/operationHandler.ts`, find the `createOperationHandler` function. After `endOperation` is called (line ~113), wrap in a try/finally:

```typescript
try {
    // ... existing startOperation + handler + endOperation
} finally {
    const recording = RecordingService.getInstance()
    if (recording) {
        await recording.finalize()
    }
}
```

- [ ] **Step 6: Remove singleton from RecordingService**

Change `static init` to return a new instance (non-singleton) — or keep the singleton but reset it per operation. For now, keep the singleton pattern but add a `static reset()` or make it per-registry:

```typescript
// Optional: remove static instance; ServiceRegistry owns the instance
// If keeping singleton for backward compat, ensure finalize resets:
async finalize(): Promise<string> {
    // ... existing code ...
    RecordingService.instance = undefined // reset for next run
    return filePath
}
```

- [ ] **Step 7: Compile and test**

```bash
npx tsc --noEmit
npm test -- src/utils/__tests__/operationHandler.test.ts 2>/dev/null || echo "No dedicated test, run full suite later"
```

- [ ] **Step 8: Commit**

```bash
git add src/services/recordingService.ts src/utils/operationHandler.ts
git commit -m "feat: add api-log persistence to RecordingService, finalize on operation end"
```

---

## Task 6: Refactor ReplayAdapter (chain harness)

**Files:**
- Modify: `src/operations/__tests__/chain/harness/ReplayAdapter.ts` (delegate to real pipeline)
- Modify: `src/operations/__tests__/harness/operationTestRegistry.ts` (support ReplayApiAdapter)

### Step-by-step

- [ ] **Step 1: Read current ReplayAdapter to understand buildReplayContext**

Read `src/operations/__tests__/chain/harness/ReplayAdapter.ts` lines 161-280 (buildReplayContext) and 660-740 (collectOutputs, compareOutputs).

- [ ] **Step 2: In buildReplayContext, load api-log**

```typescript
import { ReplayApiAdapter, loadApiLog } from '../../../../services/clientService/replayApiAdapter'

// Inside buildReplayContext:
const apiLogEntries = scenario.apiLogPath
    ? await loadApiLog(scenario.apiLogPath)
    : []
const replayAdapter = new ReplayApiAdapter(apiLogEntries)
```

- [ ] **Step 3: Pass ReplayApiAdapter to createTestRegistry**

```typescript
import { createTestRegistry } from '../../harness/operationTestRegistry'

const registry = createTestRegistry(sourceConfigs as SourceConfigLike[], {
    connectionService: replayAdapter,
    // Remove ~25 service-method overrides
})
```

- [ ] **Step 4: Remove all service-method mocks**

Delete the blocks that mock `sources.fetchManagedAccounts`, `identities.fetchIdentityById`, `fusion.processFusionAccounts`, `fusion.getISCAccount`, `fusion.forEachISCAccount`, `fusion.processIdentity`, and all other mocked service methods. These are no longer needed — the real services run with ReplayApiAdapter.

- [ ] **Step 5: Delegate to PipelineRunner.run()**

```typescript
import { PipelineRunner } from '../../../helpers/corePipeline'
// ...

const outputs: unknown[] = []
const mockRes = {
    send: (value: unknown) => { outputs.push(value) },
}

await ServiceRegistry.run(registry, async () => {
    await PipelineRunner.run(registry, input, 'aggregation', 'report')
})

return { outputs, registry }
```

- [ ] **Step 6: Keep compareOutputs unchanged**

Verify `compareOutputs` function works with the outputs array from mockRes. No changes needed — it compares arrays of `res.send` outputs.

- [ ] **Step 7: Keep ChainState seeding from initialState + expectedStateDelta**

The initial identity baseline is not an API call — keep the existing `ChainState` seeding from `scenario.initialState` and `step.expectedStateDelta`. This is the data ReplayApiAdapter doesn't serve.

- [ ] **Step 8: Run replay tests to verify**

```bash
npx vitest run src/operations/__tests__/chain/chain.replay.test.ts
```

Expect: tests may skip (no recordings on disk) or pass if recordings exist.

- [ ] **Step 9: Commit**

```bash
git add src/operations/__tests__/chain/harness/ReplayAdapter.ts src/operations/__tests__/harness/operationTestRegistry.ts
git commit -m "refactor: ReplayAdapter delegates to real pipeline with ReplayApiAdapter"
```

---

## Task 7: Delete FakeApiAdapter

**Files:**
- Delete: `src/operations/__tests__/chain/harness/fakeApiAdapter.ts`
- Modify: `src/operations/__tests__/harness/operationTestRegistry.ts` (use ReplayApiAdapter)
- Modify: Any test files that import FakeApiAdapter

### Step-by-step

- [ ] **Step 1: Find all imports of FakeApiAdapter**

```bash
grep -rn "FakeApiAdapter" src/
```

- [ ] **Step 2: Update createTestRegistry to use ReplayApiAdapter as default**

In `src/operations/__tests__/harness/operationTestRegistry.ts`, replace `FakeApiAdapter` import and usage with `ReplayApiAdapter` initialized with an empty entries array:

```typescript
import { ReplayApiAdapter } from '../../services/clientService/replayApiAdapter'

// Replace: new FakeApiAdapter(config)
// With: new ReplayApiAdapter([], config as any)
```

- [ ] **Step 3: Update each test file that imported FakeApiAdapter**

For each file found in step 1:
- Replace `import { FakeApiAdapter } from '...'` with `import { ReplayApiAdapter } from '...'`
- Replace `new FakeApiAdapter(...)` with `new ReplayApiAdapter([], ...)`

For tests that need specific API responses, pass `ApiLogEntry[]` with prerecorded entries instead of configuring FakeApiAdapter's empty objects.

- [ ] **Step 4: Delete the file**

```bash
rm src/operations/__tests__/chain/harness/fakeApiAdapter.ts
```

- [ ] **Step 5: Run all tests to verify**

```bash
npm test 2>&1 | tail -60
```

Fix any import errors or type errors.

- [ ] **Step 6: Commit**

```bash
git add -u src/operations/__tests__/
git rm src/operations/__tests__/chain/harness/fakeApiAdapter.ts
git commit -m "refactor: delete FakeApiAdapter, replace with ReplayApiAdapter"
```

---

## Task 8: Update chain and operation tests

**Files:**
- Modify: `src/operations/__tests__/chain/chain.replay.test.ts`
- Modify: `src/operations/__tests__/chain/explore.test.ts`
- Modify: Any operation test files that reference FakeApiAdapter

### Step-by-step

- [ ] **Step 1: Update chain.replay.test.ts**

Verify that `buildReplayContext` now works with the new adapter. Update any test imports:

```typescript
// Remove imports of deleted modules if any
// Ensure ReplayApiAdapter import is correct
```

- [ ] **Step 2: Update explore.test.ts**

Same as step 1 — verify it delegates correctly.

- [ ] **Step 3: Update operation tests**

Search for any remaining `FakeApiAdapter` references in operation test files (`accountList.test.ts`, `accountRead.test.ts`, `corePipeline.test.ts`, etc.):

```bash
grep -rn "FakeApiAdapter\|fakeApiAdapter" src/operations/__tests__/
```

Replace any remaining references.

- [ ] **Step 4: Verify no references to deleted mock registry files**

```bash
grep -rn "mockRegistry\|registryMocking" src/
```

Expected: no results (these were deleted in the one-test-seam change).

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Fix any failures. Common issues:
- Tests expecting `FakeApiAdapter`'s empty-object behavior now hit `ReplayApiAdapter`'s "unrecorded API call" error — need to add entries to the api-log or accept the error as valid drift detection
- Type conversion issues from `as any` → typed adapter

- [ ] **Step 6: Commit**

```bash
git add -u src/operations/__tests__/
git commit -m "test: update chain and operation tests for ReplayApiAdapter"
```

---

## Task 9: Verification and cleanup

### Step-by-step

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass. If chain replay tests skip (no recordings on disk), that's acceptable.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no type errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no lint errors, no dead imports. `knip` may flag the deleted FakeApiAdapter as dead code — acceptable since it's been deleted.

- [ ] **Step 4: Search for remaining FakeApiAdapter references**

```bash
grep -rn "FakeApiAdapter" src/ openspec/ docs/ scripts/
```

Expected: only in ARCHITECTURE-REVIEW*.md (historical docs) and maybe CHANGELOG.md.

- [ ] **Step 5: Verify record-chain.js works**

```bash
# Check the script is syntactically valid
node -c scripts/record-chain.js
```

- [ ] **Step 6: Verify scenario.json includes apiLogPath**

Search for `apiLogPath` in RecordingService source:

```bash
grep -n "apiLogPath" src/services/recordingService.ts
```

Expected: referenced in `buildScenario` return value.

- [ ] **Step 7: Record + replay integration test (manual)**

If test data recordings exist:
```bash
npm run record  # record a chain
npm test -- src/operations/__tests__/chain/chain.replay.test.ts
```

- [ ] **Step 8: Verify drift detection**

Add a temporary test that creates a `ReplayApiAdapter` with an empty log and calls an API method — expect `ConnectorError` with "unrecorded API call" message.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: final verification — tests pass, lint clean, no dead imports"
```
