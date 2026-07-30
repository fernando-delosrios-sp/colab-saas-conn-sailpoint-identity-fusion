# Fix Duplicate Attribute Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate case-insensitive duplicate attribute names in schema discovery and schema ingestion by keeping the first encountered variant.

**Architecture:** Extract a shared `dedupeSchemaAttributesByName` helper in the schema service layer. Use skip-on-collision semantics (first wins entirely). Apply at `buildDynamicSchema` merge and `setFusionAccountSchema` ingestion. Cover with unit tests reproducing production collision pairs.

**Tech Stack:** TypeScript, Vitest, SailPoint Connector SDK

## Global Constraints

- Strict TypeScript; match existing Prettier/ESLint conventions
- Tests in `__tests__/` alongside code
- Do not run `npm test | tail` — run targeted test files directly

---

## Task 1: Dedupe helper (TDD)

**Files:**
- Create/modify: `src/services/schemaService/helpers.ts`
- Test: `src/services/schemaService/__tests__/helpers.test.ts`

- [ ] **Step 1:** Write failing tests for `dedupeSchemaAttributesByName`:
  - Input `[{name:'Username'},{name:'username'}]` → output length 1, name `Username`
  - Input `[{name:'FirstName'},{name:'firstname'},{name:'FIRSTNAME'}]` → output length 1, name `FirstName`
  - Input `[{name:'  '}]` → skipped
- [ ] **Step 2:** Run `npm test -- src/services/schemaService/__tests__/helpers.test.ts` — expect FAIL
- [ ] **Step 3:** Implement helper:

```typescript
export function dedupeSchemaAttributesByName(
    attributes: SchemaAttribute[],
    log?: { debug: (msg: string) => void }
): SchemaAttribute[] {
    const seen = new Map<string, SchemaAttribute>()
    for (const attribute of attributes) {
        if (!attribute.name || attribute.name.trim() === '') continue
        const key = attribute.name.toLowerCase()
        if (seen.has(key)) {
            log?.debug(`Skipping duplicate schema attribute "${attribute.name}" (keeping "${seen.get(key)!.name}")`)
            continue
        }
        seen.set(key, attribute)
    }
    return Array.from(seen.values())
}
```

- [ ] **Step 4:** Run tests — expect PASS
- [ ] **Step 5:** Commit: `fix(schema): add case-insensitive schema attribute dedupe helper`

---

## Task 2: Fix buildDynamicSchema

**Files:**
- Modify: `src/services/schemaService/schemaService.ts`
- Test: `src/services/schemaService/__tests__/schemaService.test.ts`

- [ ] **Step 1:** Write failing test — managed source has `firstname`, identity has `FirstName`; expect single attribute with name `firstname` (managed added before identity in merge order)
- [ ] **Step 2:** Write failing test — same source schema with `Username` and `username`; expect single attribute `Username` (first in source list)
- [ ] **Step 3:** Run tests — expect FAIL
- [ ] **Step 4:** Change `addAttribute` else branch from merge to early return (skip duplicate). Pass `this.log` for debug message.
- [ ] **Step 5:** Update "preserve original casing on collisions" test — assert later identity variant does NOT overwrite `multi`/`type` from first
- [ ] **Step 6:** Run `npm test -- src/services/schemaService/__tests__/schemaService.test.ts` — expect PASS
- [ ] **Step 7:** Commit: `fix(schema): skip duplicate attribute names in buildDynamicSchema`

---

## Task 3: Fix setFusionAccountSchema ingestion

**Files:**
- Modify: `src/services/schemaService/schemaService.ts`
- Test: `src/services/schemaService/__tests__/schemaService.test.ts`

- [ ] **Step 1:** Write failing test — call `setFusionAccountSchema` with attributes `[{name:'LastName',...},{name:'lastname',...}]`; assert `listSchemaAttributeNames()` has one `lastname` entry (case of first)
- [ ] **Step 2:** Write failing test — attribute bag `{ LastName: 'A', lastname: 'B' }` with deduped schema; `getFusionAttributeSubset` emits only one key
- [ ] **Step 3:** Run tests — expect FAIL
- [ ] **Step 4:** At start of `setFusionAccountSchema` when `accountSchema` provided, replace `accountSchema.attributes` with `dedupeSchemaAttributesByName(accountSchema.attributes, this.log)` (mutate copy or shallow clone schema object)
- [ ] **Step 5:** Run tests — expect PASS
- [ ] **Step 6:** Commit: `fix(schema): dedupe attributes on setFusionAccountSchema`

---

## Task 4: Final verification

- [ ] **Step 1:** Run `npm test -- src/services/schemaService`
- [ ] **Step 2:** Run `npm run lint`
- [ ] **Step 3:** Commit any lint fixes if needed

---

## Task 5: Changelog

- [ ] **Step 1:** Add entry to `CHANGELOG.md` under Fixed: case-insensitive duplicate attribute names in schema discovery
- [ ] **Step 2:** Commit: `docs: changelog for schema attribute dedup fix`

---

## Spec coverage map

| Spec scenario | Test task |
|---|---|
| Managed + identity collision | Task 2 Step 1 |
| Multiple casings in one source | Task 2 Step 2 |
| Schema ingestion dedup | Task 3 Step 1–2 |
| No duplicate lowercase names | Task 2 + helper tests |
| Discover operation output | Covered by buildDynamicSchema tests (operation is thin wrapper) |
