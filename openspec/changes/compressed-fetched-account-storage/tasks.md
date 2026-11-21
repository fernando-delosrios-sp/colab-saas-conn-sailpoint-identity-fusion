## 1. Compressed Block Store & Source-Partitioned Key Index

- [ ] 1.1 Create `src/model/compressedBlockMap.ts` implementing `CompressedBlockMap<V> extends Map<string, V>` with configurable `inHeapLimit` (default `10_000`), `blockSize` (default `128`), `lruCapacity` (default `16`), raw DEFLATE level 1 (`zlib.deflateRawSync`/`inflateRawSync`), and bounded LRU read cache
- [ ] 1.2 Implement `partitionCompositeKeys` support in `CompressedBlockMap<V>` storing `<sourceId>::<nativeIdentity>` keys in a two-level `Map<sourceId, Map<nativeIdentity, slot>>` (with fallback `""` partition for non-composite keys) and reconstructing full keys in `keys()`, `entries()`, and `forEach()`
- [ ] 1.3 Ensure `set()` overwrites, `delete()`, and `clear()` maintain exact `Map` semantics and release sealed blocks, staging buffers, and LRU cache entries when emptied or cleared
- [ ] 1.4 Add unit tests in `src/model/__tests__/compressedBlockMap.test.ts` covering in-heap identity, compressed block spill, overwrite/delete/clear memory release, LRU cache hits, source-partitioned composite keys, and non-composite fallback keys

## 2. Compact Identity-to-Account Index (`managedAccountsByIdentityId`)

- [ ] 2.1 Create `src/model/compactStringSetMap.ts` implementing `CompactStringSetMap extends Map<string, Set<string>>` storing single-key identities as a bare string internally and promoting to `Set<string>` only when a second key is added or `.get(id)` is called externally, plus non-promoting internal helpers (`addKey`, `deleteKey`, `getKeys`, `takeKeys`)
- [ ] 2.2 Add unit tests in `src/model/__tests__/compactStringSetMap.test.ts` covering single-key non-Set storage, multi-key promotion, `deleteKey`/`clear`, and full `Map<string, Set<string>>` external compatibility

## 3. Wire Stores into `FusionRun` & `SourceService`

- [ ] 3.1 Wire `CompressedBlockMap` into `src/model/fusionRun.ts` for `managedAccountsById` (composite-partitioned), `claimedAccountRetention` (composite-partitioned), `managedAccountInventory` (composite-partitioned), and `identityMapValue`, and remove the superseded `src/model/compactManagedAccountMap.ts` and its test
- [ ] 3.2 Wire `CompactStringSetMap` into `src/model/fusionRun.ts` for `managedAccountsByIdentityId` and update `setManagedAccount`, `claimAccount`, `claimAccountsForIdentity`, and `getKeysForIdentity` to use the non-promoting helpers
- [ ] 3.3 Wire `CompressedBlockMap<Account>` into `src/services/sourceService/sourceService.ts` for `fusionAccountsByNativeIdentity` in `fetchFusionAccounts()` and verify `clearFusionAccounts()` releases all compressed blocks
- [ ] 3.4 Add regression tests in `src/model/__tests__/fusionRun.test.ts` and `src/services/sourceService/__tests__/sourceService.test.ts` verifying snapshot/restore parity, post-claim inventory retention, single-account identity claim without Set allocation, and Fusion account compressed storage + clear

## 4. Verification

- [ ] 4.1 Confirm canonical test and check commands pass: `npm test`, `npm run build`, and `npm run lint`
- [ ] 4.2 Verify all delta spec scenarios in `specs/fusion-run/spec.md` and `specs/source-service/spec.md` are covered by named automated tests

## 5. Documentation

- [ ] 5.1 Confirm no user-facing README or MkDocs configuration/CLI contract changes are required (internal storage optimization only); update JSDoc comments on `CompressedBlockMap`, `CompactStringSetMap`, `FusionRun`, and `SourceService`

## 6. Changelog

- [ ] 6.1 Create or update the `CHANGELOG.md` entry for this change under the current `package.json` version (`2.2.0`) using `changelog-generator`
- [ ] 6.2 Confirm the changelog entry summarizes the memory reduction for large aggregations accurately
