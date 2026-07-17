# lock-service Spec

## Purpose

The lock service (`src/services/lockService.ts`) is the connector's in-process synchronization primitive. It exposes a single `withLock<T>(key, fn)` API (and an in-memory implementation `InMemoryLockService`) that serializes async work across operations that share a key — for example, two concurrent updates against the same account. The service is intentionally lightweight: it does not cross process boundaries and is scoped to a single connector instance. This spec defines the contract for lock acquisition, queueing, and the optional `waitForAllPendingOperations()` drain used in tests and shutdown paths.

## Requirements

### Requirement: Locks MUST serialize concurrent operations that share a key

The lock service MUST ensure that, for any given key, only one operation is in flight at a time across the connector process. Acquisitions for the same key MUST be queued and dispatched in FIFO order. Acquisitions for different keys MUST NOT block one another.

#### Scenario: Two concurrent acquisitions for the same key serialize

- **GIVEN** two `withLock('account:42', fnA)` and `withLock('account:42', fnB)` calls are issued concurrently
- **WHEN** both start
- **THEN** `fnB` does not begin until `fnA` has resolved
- **AND** the second call's return value is `fnB`'s return value, unchanged

#### Scenario: Acquisitions for different keys do not block each other

- **GIVEN** `withLock('account:1', fnA)` and `withLock('account:2', fnB)` are issued concurrently
- **WHEN** both start
- **THEN** neither call blocks on the other
- **AND** both functions execute to completion in parallel
