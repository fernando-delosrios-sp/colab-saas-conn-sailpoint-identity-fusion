# `$Normalize.ascii` — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Add a `$Normalize.ascii(input, language?)` Velocity helper that transliterates non-ASCII characters with language-specific digraph rules.

**Architecture:** New `normalizeAscii` function in `normalize.ts`, with two rule-set maps (DACH, Nordic) and a hierarchical language resolver. Unknown/missing languages fall back to the `transliteration` library. Exported via the existing `Normalize` object with `withNormalizeFallback` wrapper.

**Tech Stack:** TypeScript, `transliteration` v2.6.1 (already a dependency), Vitest

---

## Task 1: Add diacritic maps and resolver

- [ ] **Step 1:** Open `src/services/attributeService/contextHelpers/normalize.ts`, add import at line 6:
  ```typescript
  import { transliterate } from 'transliteration'
  ```
- [ ] **Step 2:** After the `NAME_PARTICLES` constant (~line 8), add:
  ```typescript
  const DACH_DIGRAPHS: Record<string, string> = {
      'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
  }

  const NORDIC_DIGRAPHS: Record<string, string> = {
      'ä': 'ae', 'ö': 'oe', 'å': 'aa', 'ø': 'oe',
  }

  const LANGUAGE_RULES: Record<string, Record<string, string>> = {
      'de': DACH_DIGRAPHS,
      'no': NORDIC_DIGRAPHS,
      'da': NORDIC_DIGRAPHS,
      'sv': NORDIC_DIGRAPHS,
  }
  ```
- [ ] **Step 3:** After the maps, add the resolver:
  ```typescript
  const resolveLanguage = (language: string): Record<string, string> | undefined => {
      const key = language.toLowerCase()
      if (LANGUAGE_RULES[key]) return LANGUAGE_RULES[key]
      const dashIdx = key.indexOf('-')
      if (dashIdx !== -1) return LANGUAGE_RULES[key.substring(0, dashIdx)]
      return undefined
  }
  ```
- [ ] **Step 4:** Commit: `feat: add diacritic maps and language resolver for Normalize.ascii`

## Task 2: Implement normalizeAscii function

- [ ] **Step 1:** Before the `Normalize` export object (~line 372), add:
  ```typescript
  const normalizeAscii = (input: string, language?: string): string | undefined => {
      if (!input || !input.trim()) return undefined

      const rules = language ? resolveLanguage(language) : undefined
      let result = input.toLowerCase()

      if (rules) {
          for (const [char, replacement] of Object.entries(rules)) {
              result = result.split(char).join(replacement)
          }
      } else {
          result = transliterate(result)
      }

      return result
  }
  ```
- [ ] **Step 2:** Add to the `Normalize` export object:
  ```typescript
      ascii: withNormalizeFallback('ascii', normalizeAscii),
  ```
- [ ] **Step 3:** Commit: `feat: add normalizeAscii function and Normalize.ascii export`

## Task 3: Write tests

- [ ] **Step 1:** Open `src/services/attributeService/__tests__/formatting.test.ts`
- [ ] **Step 2:** Before the "Edge Cases" describe block (~line 255), add a new describe block with the following scenarios:
  - **German**: `$Normalize.ascii("Müller", "de")` → `"mueller"`
  - **German sharp s**: `$Normalize.ascii("Straße", "de")` → `"strasse"`
  - **German all-caps**: `$Normalize.ascii("GÜNTHER MÜLLER", "de")` → `"guenther mueller"`
  - **German locale variants**: `"de-DE"`, `"de-AT"`, `"de-CH"` all → DACH rules
  - **German case-insensitive**: `"DE"`, `"De"` → DACH rules
  - **Norwegian**: `$Normalize.ascii("Søren Østergaard", "no")` → `"soeren oestergaard"`
  - **Danish**: `$Normalize.ascii("Jørgen Ågaard", "da")` → `"joergen aagaard"`
  - **Swedish**: `$Normalize.ascii("Sören Åström", "sv")` → `"soeren aastroem"`
  - **Fallback (French)**: `$Normalize.ascii("José", "fr")` → `"jose"`
  - **Fallback (no language)**: `$Normalize.ascii("José")` → `"jose"`
  - **Fallback (unknown lang)**: `$Normalize.ascii("Müller", "xyz")` → `"muller"`
  - **Chained with name**: `$Normalize.name($Normalize.ascii("MÜLLER", "de"))` → `"Mueller"`
  - **Chained with fullName**: `$Normalize.fullName($Normalize.ascii("GÜNTHER MÜLLER", "de"))` → `"Guenther Mueller"`
  - **Empty input**: `$Normalize.ascii("")` → `undefined`
  - **Whitespace input**: `$Normalize.ascii("   ")` → `undefined`
  - **Pure ASCII**: `$Normalize.ascii("hello", "de")` → `"hello"`
  - **Nordic locale variants**: `"no-NO"`, `"da-DK"`, `"sv-SE"` → Nordic rules
- [ ] **Step 3:** Run `npx vitest run src/services/attributeService/__tests__/formatting.test.ts` to verify tests pass
- [ ] **Step 4:** Commit: `test: add Normalize.ascii test suite for German, Nordic, and fallback`

## Task 4: Verify

- [ ] **Step 1:** Run `npm test` to confirm full test suite passes
- [ ] **Step 2:** Run `npm run lint` to confirm no linting errors
- [ ] **Step 3:** Run `npm run typecheck` to confirm no TypeScript errors
- [ ] **Step 4:** Commit any fixes as needed
