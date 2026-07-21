## Why

A recent codebase audit identified several areas of over-engineering and unnecessary dependencies. Dropping the `uuid` and `form-data` dependencies in favor of native Node APIs reduces the footprint of the package. Removing the unused `WorkQueue` and `LockService` interfaces eliminates YAGNI boilerplate. Acting on these zero-regression cuts keeps the codebase lean, reduces supply chain risk from external packages, and improves readability without altering behavior.

## What Changes

**Drop uuid dependency**
- From: Generating UUIDs via the `uuid` npm package
- To: Generating UUIDs using Node 14.17+ native `crypto.randomUUID()`
- Reason: The standard library handles this directly, eliminating a dependency
- Impact: Non-breaking, internal only

**Drop form-data dependency**
- From: Using `form-data` npm package for multipart requests
- To: Using Node 18+ native `FormData`
- Reason: Native support exists in modern Node environments
- Impact: Non-breaking, internal only

**Remove YAGNI interfaces**
- From: `WorkQueue` and `LockService` interfaces with only single implementations (`FusionRun` and `InMemoryLockService`)
- To: Concrete classes only
- Reason: Interfaces are not needed for single implementations, reducing boilerplate
- Impact: Non-breaking, internal only

## Capabilities

### New Capabilities
None

### Modified Capabilities
None

## Impact

- `package.json` dependencies will shrink (removing `uuid` and `form-data`)
- Internal model and service types will change to directly reference `FusionRun` and `InMemoryLockService` instead of interfaces.
- No public APIs or user-facing behavior will change.
