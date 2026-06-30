## Context

The connector has two retry paths:

1. **axios-retry path** (`SdkApiAdapter`): used only when the queue is disabled. Configured via `createRetriesConfig`.
2. **ApiQueue path**: used by default. Calls the standalone `shouldRetry` and `calculateRetryDelay` helpers.

Both paths encode the same policy (network errors, 429, 5xx, timeouts), but the code is duplicated. The duplication has produced drift in the exponential exponent and in `retry-after` jitter handling.

## Goals / Non-Goals

**Goals:**
- Maintain exactly one copy of the retry-condition logic and one copy of the delay-calculation logic.
- Make the retry behavior identical between the axios-retry and queue paths.
- Add jitter to `retry-after` delays in the axios path.
- Support both integer-second and HTTP-date `Retry-After` header values.

**Non-Goals:**
- Changing which status codes or error codes trigger a retry.
- Capping `retry-after` delays.
- Refactoring `ApiQueue` or `SdkApiAdapter` beyond wiring them to the shared helpers.
- Adding new dependencies.

## Decisions

**1. Single retry-condition function**
`shouldRetry(error)` becomes the canonical condition. `createRetriesConfig` assigns `retryCondition: shouldRetry`.
*Rationale:* Eliminates the inline duplicate and ensures both paths agree on what is retryable.

**2. Single delay-calculator function**
`calculateRetryDelay(retryCount, error)` becomes the canonical delay calculator. `createRetriesConfig` assigns `retryDelay: calculateRetryDelay`.
*Rationale:* Centralizes exponent, jitter, and `retry-after` handling.

**3. Exponent: `BASE * 2^(retryCount - 1)`**
Both paths use the standard exponential backoff shape where the first retry waits roughly the base delay.
*Rationale:* This is the conventional definition and already matches the queue path. The non-queue axios path will retry slightly faster, but since the queue is the default, impact is limited.

**4. `retry-after` remains uncapped**
Parsed `retry-after` delays are returned as-is plus jitter, without clamping to `MAX_RETRY_DELAY_MS`.
*Rationale:* The header is an explicit server instruction; capping it risks ignoring the rate-limit signal.

**5. Strict IMF-fixdate parsing for HTTP-date values**
`parseRetryAfter` first checks for a pure non-negative integer, then matches the strict `Day, DD Mon YYYY HH:MM:SS GMT` pattern before calling `Date.parse`.
*Rationale:* Avoids misinterpreting arbitrary strings as far-future dates, which would be dangerous without a cap.

**6. Negative `retry-after` integers are treated as invalid**
They fall back to exponential backoff rather than clamping to zero.
*Rationale:* Negative values violate the spec; immediate retry could hammer a rate-limited server.

## Risks / Trade-offs

- **Risk: Behavioral change for non-queue deployments**
  - First retry delay drops from ~2 s to ~1 s. Subsequent delays also halve until the cap.
  - *Mitigation:* This aligns the non-queue path with the queue path and standard backoff. No tests assert exact timing.

- **Risk: Far-future `retry-after` header stalls the connector**
  - Because we do not cap `retry-after`, a misconfigured server could ask for a very long wait.
  - *Mitigation:* Strict parsing limits this to well-formed integer or IMF-fixdate values. This is the explicit trade-off of respecting server signals.

- **Risk: `Date.parse` platform quirks**
  - Even with strict regex, `Date.parse` behavior can vary.
  - *Mitigation:* The regex validates the exact RFC format before parsing; if parsing fails, we fall back to exponential backoff.
