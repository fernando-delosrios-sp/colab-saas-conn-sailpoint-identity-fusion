import { describe, it, expect, vi } from 'vitest'
import { FusionRun } from '../../../model/fusionRun'
import { FormService } from '../../../services/formService/formService'

/** Minimal client.call mock that supports sequential pagination used by form instance fetch. */
function createFormClientCallMock(customFormsMock: Record<string, unknown>) {
    return async (fn: (api: { customForms: typeof customFormsMock }, params?: unknown) => Promise<unknown>, policy?: {
        paginate?: { mode: string; baseParams?: Record<string, unknown> }
        onPageProgress?: (loaded: number, total?: number) => void
    }) => {
        const api = { customForms: customFormsMock }
        if (policy?.paginate?.mode === 'sequential') {
            const params = { ...(policy.paginate.baseParams ?? {}), limit: 250, offset: 0 }
            const page = (await fn(api, params)) as { data?: unknown[] }
            const items = page?.data ?? []
            policy.onPageProgress?.(items.length)
            return items
        }
        const result = await fn(api)
        if (result && typeof result === 'object' && 'data' in result) {
            const data = (result as { data: unknown }).data
            if (Array.isArray(data)) return data
            if (data && typeof data === 'object' && 'results' in data) {
                return (data as { results: unknown[] }).results
            }
        }
        return result
    }
}

describe('replay harness simulated recording time', () => {
    it('keeps backdated forms active at recorded step time (non-zero formsFound)', async () => {
        const recordedStepTime = '2026-07-31T08:24:12.899Z'
        const recordedMs = Date.parse(recordedStepTime)
        const formCreatedAt = new Date(recordedMs - 5 * 24 * 60 * 60 * 1000).toISOString()

        const searchFormDefinitionsByTenant = vi.fn().mockResolvedValue({
            data: {
                results: [{ id: 'form-recorded', name: 'Fusion recorded', created: formCreatedAt }],
            },
        })
        const searchFormInstancesByTenant = vi.fn().mockResolvedValue({ data: [] })
        const customFormsMock = {
            searchFormInstancesByTenant,
            searchFormDefinitionsByTenant,
            deleteFormDefinition: vi.fn().mockResolvedValue({}),
        }

        const run = new FusionRun()
        run.setSimulatedTime(recordedStepTime)

        const service = new FormService(
            {
                fusionFormNamePattern: 'Fusion',
                fusionFormExpirationDays: 7,
            } as any,
            { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), setProgress: vi.fn(), track: vi.fn(() => ({ done: vi.fn() })) } as any,
            {
                customFormsApi: customFormsMock,
                call: createFormClientCallMock(customFormsMock),
                execute: async (fn: () => Promise<any>) => fn(),
            } as any,
            {} as any,
            undefined,
            undefined,
            run
        )

        await service.fetchFormInstances({ staleFormCleanup: true })

        expect(run.formsFound).toBe(1)
        expect(searchFormInstancesByTenant).toHaveBeenCalledTimes(1)
    })
})
