import { describe, it, expect, vi } from 'vitest'
import { DryRunApiAdapter } from '../dryRunApiAdapter'
import { IscApiAdapter } from '../iscApiAdapter'
import { isWriteMethod, WRITE_METHODS } from '../apiWriteClassification'
import { RecordingApiAdapter, ApiLogEntry } from '../recordingApiAdapter'

function createInnerMock() {
    return {
        config: {} as any,
        accountsApi: {
            listAccounts: vi.fn().mockResolvedValue({ data: [{ id: 'acct-1' }] }),
            updateAccount: vi.fn().mockResolvedValue({ data: { id: 'acct-1' } }),
        },
        identitiesApi: {},
        searchApi: {},
        sourcesApi: {
            updateSource: vi.fn().mockResolvedValue({ data: { id: 'source-1' } }),
        },
        customFormsApi: {
            createFormDefinition: vi.fn().mockResolvedValue({ data: { id: 'real-form' } }),
            createFormInstance: vi.fn().mockResolvedValue({ data: { id: 'real-instance' } }),
        },
        workflowsApi: {},
        entitlementsApi: {},
        transformsApi: {},
        governanceGroupsApi: {},
        taskManagementApi: {},
        identityProfilesApi: {},
        identityAttributesApi: {},
    } satisfies IscApiAdapter
}

describe('DryRunApiAdapter', () => {
    it('shares write classification with replay adapter exports', () => {
        expect(WRITE_METHODS.has('updateSourceSchema')).toBe(true)
        expect(isWriteMethod('updateSource')).toBe(true)
    })

    it('delegates read calls to the inner adapter', async () => {
        const inner = createInnerMock()
        const adapter = new DryRunApiAdapter(inner)

        const result = await (adapter.accountsApi as any).listAccounts({ limit: 10 })

        expect(inner.accountsApi.listAccounts).toHaveBeenCalledWith({ limit: 10 })
        expect(result).toEqual({ data: [{ id: 'acct-1' }] })
    })

    it('does not delegate write calls to the inner adapter', async () => {
        const inner = createInnerMock()
        const adapter = new DryRunApiAdapter(inner)

        await (adapter.accountsApi as any).updateAccount({ id: 'acct-1', jsonPatch: [] })
        await (adapter.sourcesApi as any).updateSource({ id: 'source-1', jsonPatch: [] })

        expect(inner.accountsApi.updateAccount).not.toHaveBeenCalled()
        expect(inner.sourcesApi.updateSource).not.toHaveBeenCalled()
    })

    it('returns synthetic form definition IDs with SDK response shape', async () => {
        const adapter = new DryRunApiAdapter(createInnerMock())
        const formsApi = adapter.customFormsApi as any

        const first = await formsApi.createFormDefinition({ body: { name: 'review-form' } })
        const second = await formsApi.createFormDefinition({ body: { name: 'review-form' } })

        expect(first.data.id).toMatch(/^dryrun-[a-f0-9]{16}$/)
        expect(second.data.id).toBe(first.data.id)
    })

    it('returns synthetic form instance IDs', async () => {
        const adapter = new DryRunApiAdapter(createInnerMock())
        const formsApi = adapter.customFormsApi as any

        const response = await formsApi.createFormInstance({
            body: {
                formDefinitionId: 'def-1',
                recipients: [{ id: 'reviewer-1', type: 'IDENTITY' }],
                formInput: { accountId: 'acct-1' },
            },
        })

        expect(response.data.id).toMatch(/^dryrun-[a-f0-9]{16}$/)
        expect(response.data.formDefinitionId).toBe('def-1')
        expect(response.data.recipients).toEqual([{ id: 'reviewer-1', type: 'IDENTITY' }])
        expect(response.data.formInput).toEqual({ accountId: 'acct-1' })
    })

    it('exposes all 12 IscApiAdapter getters', () => {
        const adapter = new DryRunApiAdapter(createInnerMock())

        expect(adapter.accountsApi).toBeDefined()
        expect(adapter.identitiesApi).toBeDefined()
        expect(adapter.searchApi).toBeDefined()
        expect(adapter.sourcesApi).toBeDefined()
        expect(adapter.customFormsApi).toBeDefined()
        expect(adapter.workflowsApi).toBeDefined()
        expect(adapter.entitlementsApi).toBeDefined()
        expect(adapter.transformsApi).toBeDefined()
        expect(adapter.governanceGroupsApi).toBeDefined()
        expect(adapter.taskManagementApi).toBeDefined()
        expect(adapter.identityProfilesApi).toBeDefined()
        expect(adapter.identityAttributesApi).toBeDefined()
    })

    it('records zero inner writes when wrapped by RecordingApiAdapter', async () => {
        const inner = createInnerMock()
        const entries: ApiLogEntry[] = []
        const recording = new RecordingApiAdapter(inner, (entry) => entries.push(entry))
        const adapter = new DryRunApiAdapter(recording)

        await (adapter.accountsApi as any).updateAccount({ id: 'acct-1' })
        await (adapter.customFormsApi as any).createFormDefinition({ body: { name: 'form' } })

        const writeEntries = entries.filter((entry) => isWriteMethod(entry.method))
        expect(writeEntries).toHaveLength(0)
    })
})

