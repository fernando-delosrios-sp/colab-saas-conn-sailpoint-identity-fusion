import { describe, it, expect, beforeEach } from 'vitest'
import { FusionCollections } from '../fusionCollections'
import { FusionLayers } from '../fusionLayers'

describe('FusionLayers', () => {
    let collections: FusionCollections
    let layers: FusionLayers

    beforeEach(() => {
        collections = new FusionCollections(50)
        layers = new FusionLayers(
            collections,
            new Set(['Source A', 'Source B']),
            3600
        )
    })

    describe('state accessors', () => {
        it('read/write needsRefresh', () => {
            expect(layers.needsRefresh).toBe(false)
            layers.needsRefresh = true
            expect(layers.needsRefresh).toBe(true)
        })

        it('read/write needsReset', () => {
            expect(layers.needsReset).toBe(false)
            layers.needsReset = true
            expect(layers.needsReset).toBe(true)
        })

        it('read/write disabled', () => {
            expect(layers.disabled).toBe(false)
            layers.disabled = true
            expect(layers.disabled).toBe(true)
        })

        it('read/write uncorrelated', () => {
            expect(layers.uncorrelated).toBe(false)
            layers.uncorrelated = true
            expect(layers.uncorrelated).toBe(true)
        })

        it('read/write isIdentity', () => {
            expect(layers.isIdentity).toBe(false)
            layers.isIdentity = true
            expect(layers.isIdentity).toBe(true)
        })

        it('read/write originSource and originAccount', () => {
            layers.originSource = 'Source A'
            layers.originAccount = 'src-a::native-1'
            expect(layers.originSource).toBe('Source A')
            expect(layers.originAccount).toBe('src-a::native-1')
        })

        it('read/write originIdentityInScope', () => {
            expect(layers.originIdentityInScope).toBeUndefined()
            layers.originIdentityInScope = true
            expect(layers.originIdentityInScope).toBe(true)
        })
    })

    describe('addIdentityLayer', () => {
        it('sets identity info and marks correlated accounts', () => {
            let capturedEmail: string | undefined
            let capturedInfo: any

            const identity = {
                id: 'id-1',
                name: 'Test Identity',
                attributes: { email: 'test@test.com' },
                accounts: [
                    { source: { name: 'Source A', id: 'src-a' }, nativeIdentity: 'native-1' } as any,
                ],
            } as any

            layers.addIdentityLayer(
                identity,
                { identity: {} },
                undefined,
                undefined,
                (email) => { capturedEmail = email },
                (info) => { capturedInfo = info }
            )

            expect(layers.isIdentity).toBe(true)
            expect(capturedEmail).toBe('test@test.com')
            expect(capturedInfo).toBeDefined()
        })

        it('does not promote isIdentity when the account is uncorrelated', () => {
            layers.uncorrelated = true
            const identity = {
                id: 'id-1',
                name: 'Test Identity',
                attributes: { email: 'test@test.com' },
            } as any

            layers.addIdentityLayer(identity, { identity: {} }, undefined)

            expect(layers.isIdentity).toBe(false)
        })
    })

    describe('addFusionDecisionLayer', () => {
        it('rejects invalid managed keys', () => {
            const decision = {
                account: { id: 'not-a-composite-key', sourceName: 'Source A' },
                newIdentity: true,
                submitter: { name: 'admin' },
                sourceType: 'authoritative',
            } as any

            expect(() => layers.addFusionDecisionLayer(decision)).toThrow()
        })

        it('processes a valid manual decision', () => {
            const decision = {
                account: { id: 'src-a::native-1', sourceName: 'Source A', name: 'Test' },
                newIdentity: true,
                submitter: { name: 'admin' },
                sourceType: 'authoritative',
            } as any

            layers.addFusionDecisionLayer(decision)
            expect(collections.statusesSet.has('manual')).toBe(true)
            expect(collections.statusesSet.has('uncorrelated')).toBe(true)
        })
    })

    describe('addFusionMatch', () => {
        it('sets isMatch flag and records match', () => {
            const match = { score: 95 } as any
            layers.addFusionMatch(match)
            expect(layers.isMatch).toBe(true)
            expect(collections.fusionMatches).toContain(match)
        })
    })
})

