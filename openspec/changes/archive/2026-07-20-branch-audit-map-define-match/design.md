## Context

The `map-define-match` codebase branch contains various opportunities for cleaning up technical debt and enhancing runtime performance. Over time, code paths in the fusion and matching services have accumulated unnecessary abstractions (e.g. wrapper methods), duplicated constants, and unused linear scan utilities. In hot paths (like matching identity records), iterating over array spreads of sets produces an O(n) overhead that slows down processing. This design outlines the approach for streamlining these code paths without introducing breaking behavioral changes.

## Goals / Non-Goals

**Goals:**
- Eliminate O(n) array allocations on hot loops (specifically in `matchingService.ts`).
- Remove unused and dead code to simplify maintainability.
- Centralize environment flag checks (`RECORD_MODE`) to a single stateful location.
- Standardize code formatting, JSDoc alignments, and shared imports.

**Non-Goals:**
- Altering the fundamental algorithms or accuracy of the match process.
- Modifying the system's external interfaces or configuration shapes.
- Changing test assertions beyond those needed to adapt to centralized dependencies.

## Decisions

### D1: Centralizing the `RECORD_MODE` Flag
- **Decision**: Read `process.env.RECORD_MODE` once and attach it as a boolean `isRecordMode` to the `FusionRun` context.
- **Rationale**: Currently, multiple files check `process.env` independently. Accessing environment variables can be slow, and testing is harder when dependencies rely directly on the global environment. Storing it on `FusionRun` makes it a mockable, context-bound boolean.
- **Alternative considered**: Pass the boolean down explicitly to every service constructor. Rejected because `FusionRun` is already passed down as the shared context object.

### D2: Eliminating `hasEquivalentManagedAccountId`
- **Decision**: Delete the function entirely.
- **Rationale**: A branch audit confirmed it's completely unused. Dead code that masquerades as an expensive operation creates unnecessary cognitive load.
- **Alternative considered**: Optimize it. Rejected because there's no reason to optimize code that isn't called.

### D3: Hot-path Iteration over Sets
- **Decision**: Use a direct `for...of` loop over `accountIdsSet` and `missingAccountIdsSet` instead of array spreading (`[...setA, ...setB]`) in `identityMatchesManagedAccountKey`.
- **Rationale**: Spreading creates an array in memory, adding overhead on every call. Direct iteration over the Sets is O(1) space and avoids garbage collection churn.
- **Alternative considered**: Using an Iterator chain utility. Rejected as too complex for a simple loop optimization.

### D4: Inlining `FusionService` Delegations
- **Decision**: Remove 1-line wrapper methods (e.g. `handleIdentityMatch`) and have callers use `this.outcomeHandler` directly.
- **Rationale**: The wrappers provide no abstraction value and inflate the size of `FusionService`. Direct calls to `outcomeHandler` make the dependency transparent.
- **Alternative considered**: Keep them for encapsulation. Rejected because they are internal private helpers anyway.

## Risks / Trade-offs

- **Risk**: Deleting `hasEquivalentManagedAccountId` breaks a dynamically invoked path.
  - **Mitigation**: TypeScript's static analysis, `knip`, and the full test suite verify it is entirely dead code.
- **Risk**: Modifying the set iteration logic introduces a bug in matching logic.
  - **Mitigation**: The loop restructuring is purely mechanical. Unit tests (`vitest run`) cover the matching scenarios.

## Migration Plan

N/A — This change does not alter deployment structure, endpoints, or DB schemas. It is purely a code-level refactoring.

## Open Questions

None.
