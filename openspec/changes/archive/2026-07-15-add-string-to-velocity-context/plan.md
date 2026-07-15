# Add String class to Velocity context Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Expose the native Javascript `String` object in the Velocity context helpers to enable string manipulations in Velocity templates.

**Architecture:** We will simply export `String` from `contextHelpers` by adding `String: String` or just `String` to the exported object in `src/services/attributeService/contextHelpers/index.ts`. This immediately makes it available as `$String` within evaluated templates.

**Tech Stack:** TypeScript, Node.js, Jest

---

## Task 1: Modify Context Helpers

- [ ] **Step 1:** Open `src/services/attributeService/contextHelpers/index.ts`.
- [ ] **Step 2:** Add `String` to the `contextHelpers` export object so it looks like `export const contextHelpers = { Datefns, Math, AddressParse, Normalize, JSON: JSONHelper, String }`.
- [ ] **Step 3:** Commit the change with message `feat: expose String in Velocity context`.

## Task 2: Update Tests

- [ ] **Step 1:** Open `src/services/attributeService/__tests__/formatting.test.ts`.
- [ ] **Step 2:** Add a new test case inside a relevant `describe` block verifying that `$String(123)` returns `"123"`. For example:
  ```typescript
  it('should support $String constructor in templates', () => {
      const result = evaluateVelocityTemplate('$String(123)', {})
      expect(result).toBe('123')
  })
  ```
- [ ] **Step 3:** Add another test case verifying static string method access if applicable, e.g., `$String.fromCharCode(65)`.
  ```typescript
  it('should support $String static methods in templates', () => {
      const result = evaluateVelocityTemplate('$String.fromCharCode(65)', {})
      expect(result).toBe('A')
  })
  ```
- [ ] **Step 4:** Run tests using `npm test` to ensure both new tests pass and existing tests remain unaffected.
- [ ] **Step 5:** Commit the change with message `test: verify String object is available in Velocity context`.
