## Context

The SDK connector framework expects every operation to finalize its response via `res.send()` or `res.error()`. However, if custom logic terminates early or throws an error that is somehow swallowed, the request stream never closes and hangs indefinitely, leading to resource exhaustion.

## Goals / Non-Goals

**Goals:**
- Provide a robust, centralized mechanism that guarantees every operation either succeeds explicitly or fails explicitly.
- Ensure that an unhandled crash correctly preserves the original error stack trace rather than being masked by the new safeguard.

**Non-Goals:**
- We are not refactoring the way operations are implemented or stream data, only ensuring they conclude.

## Decisions

**1. Intercepting the Response Object (Option A)**
We will wrap the `res` object provided by the SDK with a lightweight proxy that monitors `send` and `error` method calls, setting a `responseSent = true` flag when they are invoked.
*Rationale:* This prevents us from having to modify every single operation handler file (which would be intrusive and error-prone for new custom operations).

**2. Verifying the Flag at the end of the `try` block**
We will check the `responseSent` flag immediately after `runOperation` resolves in the `try` block. If `!responseSent`, we will explicitly throw an error (`"Operation finished without calling res.send() or res.error()"`).
*Rationale:* If we checked this in the `finally` block, we risk throwing a new error that overwrites the original `ConnectorError` if the operation crashed. By placing the check only on the "happy path", we ensure it only fires when the operation genuinely forgot to respond without crashing.

## Risks / Trade-offs

- **Risk:** Developers might use experimental or unsupported SDK properties on `res` that our wrapper doesn't proxy perfectly.
- **Mitigation:** We will use standard object spread/wrapping (`{ ...res, send, error }`) so all original properties and methods (like `keepAlive`) are preserved intact.
