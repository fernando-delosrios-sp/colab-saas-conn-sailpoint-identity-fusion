## Context

A codebase audit using the `ponytail-audit` tool identified several instances of over-engineering and unnecessary dependencies. After exploring the findings, we validated that dropping `uuid` and `form-data` in favor of native Node APIs is a safe, high-reward cleanup. Furthermore, two internal interfaces (`WorkQueue` and `LockService`) each have only a single implementation, making them YAGNI boilerplate. We are cleaning these up to reduce the overall dependency count and simplify internal types.

## Goals / Non-Goals

**Goals:**
- Eliminate `uuid` and `form-data` dependencies from `package.json`.
- Replace all usages of `uuid` with `crypto.randomUUID()`.
- Replace all usages of `form-data` with native `FormData`.
- Remove `WorkQueue` and `LockService` interfaces, typing references directly to `FusionRun` and `InMemoryLockService`.

**Non-Goals:**
- Removing `transliteration` (required for global username generation).
- Replacing `axios`/`axios-retry` with native fetch (too heavily entangled with the SailPoint SDK).
- Refactoring `velocityjs`/`handlebars` templating.

## Decisions

### D1: Drop `uuid` for native `crypto.randomUUID()`
- **Choice**: Replace the `uuid` package with Node's native `crypto.randomUUID()`.
- **Reason**: We target modern Node environments where `crypto` handles standard v4 UUID generation effectively without third-party dependencies.
- **Alternatives Considered**: Keeping `uuid` for cross-platform compatibility, but as a server-side connector running on Node >= 14.17, native is guaranteed to work.

### D2: Drop `form-data` for native `FormData`
- **Choice**: Replace the `form-data` package with the native `FormData` object available globally in Node 18+.
- **Reason**: Natively supported multipart parsing eliminates the need for an external package.
- **Alternatives Considered**: Using `form-data` due to older Node versions, but the project runtime environment is modern enough.

### D3: Remove `WorkQueue` and `LockService` interfaces
- **Choice**: Delete these interfaces and use `FusionRun` and `InMemoryLockService` directly.
- **Reason**: They only have single implementations. Keeping them adds boilerplate that doesn't serve a structural or testing purpose beyond what the classes already offer.
- **Alternatives Considered**: Keeping them for future extensibility, rejected because YAGNI. If multiple implementations are needed later, they can be reintroduced then.

## Risks / Trade-offs

- [Trade-off] Dropping `form-data`: The `sailpoint-api-client` configuration uses `form-data` to set `setMaxListeners(25)` because the older library extends `EventEmitter`. Native `FormData` does not extend `EventEmitter`, so the listener hack will be invalid. -> Accepted reason: Native `FormData` does not have the same listener leak issues, making the hack unnecessary.

## Migration Plan

N/A — This change is a purely internal refactoring and does not involve deployment environment changes or state migrations.

## Open Questions

- Does `sailpoint-api-client` strictly require the `form-data` package's specific API surface (e.g., node stream compatibility) that might differ from native `FormData`? (To be verified during tasks execution).
