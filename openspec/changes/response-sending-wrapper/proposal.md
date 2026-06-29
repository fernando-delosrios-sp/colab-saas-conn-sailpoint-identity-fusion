## Why

Currently, connector operations must explicitly call `res.send()` or `res.error()` to conclude a request. If a custom operation forgets to do this (e.g., due to an early return or a swallowed error), the request hangs indefinitely. This change introduces a centralized safeguard to ensure every operation completes properly, which directly addresses over 10 hanging-request bugs.

## What Changes

- Wrap the `res` object inside `createOperationHandler` to track whether `res.send()` or `res.error()` was called.
- Check the tracked state in the `try` block immediately after `runOperation` finishes successfully.
- If the operation exits cleanly without responding, throw an explicit error (`"Operation finished without calling res.send() or res.error()"`) rather than letting it hang.
- Keep the existing `catch` behavior, which correctly handles throwing exceptions without being overridden by a `finally` block check.

## Capabilities

### New Capabilities
- `response-guarantee`: Ensures all connector operations always return a response or error, preventing hanging requests.

### Modified Capabilities
- (None)

## Impact

- **Affected code:** `src/utils/operationHandler.ts`
- **Impact:** Custom operation implementations will fail fast with a clear error if they forget to send a response, instead of hanging. This is a highly beneficial internal safety mechanism.
