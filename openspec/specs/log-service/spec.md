# log-service Spec

## Purpose

The log service (`src/services/logService/`) is the connector's logging facade. It defines the `LogService` interface, the SDK adapter that writes to the connector host, and the helper utilities used elsewhere in the codebase to log structured events, known operation function names, and a small set of standardized debug/warn patterns. This spec defines the contract for what the rest of the connector can assume about the log surface (level, structured fields, redaction) and what the host receives.
## Requirements
### Requirement: The log service MUST expose a stable, structured log surface

The log service MUST expose a `LogService` interface with the standard levels (`debug`, `info`, `warn`, `error`). The SDK adapter MUST forward every call to the connector host as a plain text message without lossy transformation. For operations with an `operationContext` (for example `accountList`), messages SHALL be prefixed with `[operationContext]`. During config bootstrap before any operation starts, messages emitted via the bootstrap logger SHALL be prefixed with `[config]`. Structured metadata MAY be passed as optional arguments for message formatting, but the host-visible contract for operational visibility SHALL be standardized text line kinds (`STATUS`, `EVENT_SUMMARY`, `PHASE`, `STEP`, `METRIC`, `WARN STALL`, `EPILOGUE`, `DETAIL`) rather than host-indexed structured fields.

#### Scenario: A log call reaches the connector host as plain text

- **GIVEN** a caller invokes `log.info('PHASE 4 Process START')` during accountList
- **WHEN** the host processes the event
- **THEN** the host sees one INFO event whose message includes `[accountList] PHASE 4 Process START`

#### Scenario: Operation context prefixes heartbeat lines

- **GIVEN** the account-list operation has `operationContext` set to `accountList`
- **WHEN** the operation heartbeat emits a STATUS line
- **THEN** the message SHALL begin with `[accountList] STATUS`

### Requirement: Operation heartbeat emits periodic STATUS lines

The log service SHALL provide an operation heartbeat that emits a `STATUS` text line at a configurable interval while an operation heartbeat is active. The interval SHALL be `statsLoggingIntervalMs` from Advanced Connection Settings (configured as `heartbeatInterval` in seconds in the connector UI; default 10 seconds). Each `STATUS` line SHALL include, when available: current phase, current step, pipeline progress (`done/total` with optional unit and delta since the previous tick), operation elapsed time, API queue statistics in compact form `api={active}a/{queued}q/{completed}c` with optional delta suffix, and process memory (RSS and heap used).

The `{queued}` value in the `api=` segment SHALL be the sum of `QueueStats.queueLength` and `QueueStats.rateLimitWaitCount` (treating absent `rateLimitWaitCount` as zero). This combined pending count SHALL represent all work not yet counted as active in-flight HTTP.

Pipeline progress and API queue completion are independent metrics. The pipeline progress delta SHALL reflect change in `OperationRunContext.progress.done`. The api-queue completed delta SHALL reflect change in `QueueStats.totalProcessed`. Both deltas SHALL use the format `(Δ±N/intervalSeconds)` where `intervalSeconds` is the configured heartbeat interval. The first STATUS tick after heartbeat start SHALL omit delta suffixes until a baseline exists from the prior tick.

When `OperationRunContext.progress.unit` is set, the STATUS line SHALL render the unit immediately after the fraction before the delta suffix (for example `progress=450/800 analyzed(Δ+120/10s)`).

When correlation PATCH activity has occurred in the run and the API queue has pending `IdentityService>correlateAccounts` items, STATUS lines during Output or Epilogue phase SHALL include a correlation drain segment with cumulative `completed=` and snapshot `pending=` counts alongside existing link/merge segments when non-zero.

#### Scenario: STATUS line during account-list Process phase

- **GIVEN** an account-list operation in Process phase with step `uncorrelated-sweep` and progress 537/800 analyzed
- **WHEN** the operation heartbeat interval fires
- **THEN** the connector host SHALL receive an INFO line prefixed with `[accountList] STATUS`
- **AND** the line SHALL include `phase=Process`, `step=uncorrelated-sweep`, and `progress=537/800 analyzed`

#### Scenario: STATUS includes pipeline progress delta during local work

- **GIVEN** pipeline progress was 7596/18495 at the previous STATUS tick and is now 10296/18495 during Refresh phase
- **AND** the API queue completed count remains unchanged
- **WHEN** the next STATUS line is emitted
- **THEN** the line SHALL include `progress=10296/18495` with a delta of `+2700` over the heartbeat interval
- **AND** the api segment SHALL show zero completed delta

#### Scenario: STATUS includes api-queue completed delta

- **GIVEN** the API queue completed count was 537 at the previous STATUS tick and is now 612 with 2 active and 5 queued
- **WHEN** the next STATUS line is emitted
- **THEN** the line SHALL include `api=2a/5q/612c` with a delta indicating `+75` completions since the previous tick

#### Scenario: STATUS api-queue segment uses completed not processed

- **GIVEN** a STATUS line includes API queue statistics
- **WHEN** an operator reads the line
- **THEN** the queue segment SHALL use compact form `api=Na/Nq/Nc`
- **AND** the completion counter SHALL be the third segment suffixed with `c` (not labeled `processed=`)

#### Scenario: STATUS q includes rate-limiter wait when FIFO is empty

- **GIVEN** the FIFO queue length is 0
- **AND** 49 dequeued items are awaiting rate-limit slots (`rateLimitWaitCount` is 49)
- **AND** 0 requests are active in-flight
- **WHEN** the next STATUS line is emitted
- **THEN** the line SHALL include `api=0a/49q/` in the api segment
- **AND** the completed counter delta MAY still increase on subsequent ticks as those items complete HTTP

#### Scenario: Default 10 second heartbeat interval

- **GIVEN** a source configuration with default Advanced Connection Settings
- **WHEN** a persistent account-list aggregation runs for more than 10 seconds
- **THEN** at least one STATUS heartbeat line SHALL appear within the first 10 seconds

#### Scenario: STATUS during Output shows correlation drain while queue pending

- **GIVEN** an account-list operation in Output or Epilogue phase with 2000 link PATCHes enqueued and 147 completed
- **AND** 1853 correlation PATCH jobs remain pending in the API queue
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include `completed=147` and `pending=1853` in the correlation segment

### Requirement: Operation heartbeat emits EVENT_SUMMARY lines

The log service SHALL aggregate account-level events recorded via `recordEvent` and correlation activity helpers between heartbeat ticks and emit `EVENT_SUMMARY` text lines when those counters include activity that is not already visible on the STATUS line. Counters SHALL reset after each flush even when no summary line is emitted. Multiple summary lines MAY be used when a single line would be excessively long. Match `EVENT_SUMMARY` SHALL be omitted when the only match activity in the interval is non-matched accounts; STATUS already reports pipeline progress delta and cumulative `matches(Nn/Mm/Aa/Dd)` for that work. Decision, email, and correlation summaries SHALL still emit when those counters are non-zero. Correlation activity SHALL appear in `EVENT_SUMMARY` lines using subtype segments `link=triggers/accounts` and `merge=triggers/accounts` when non-zero, plus `completed=` with interval delta when non-zero (summed across link and merge completions), and aggregated `skipped=` counts when non-zero. During account-list aggregation (`isAggregationMode`), correlation `EVENT_SUMMARY` segments SHALL NOT include `correlated-action=`.

#### Scenario: Match events summarized per tick

- **GIVEN** 12 partial matches and 2 exact matches recorded since the last heartbeat tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO line containing `EVENT_SUMMARY` with match counts
- **AND** per-account `MATCH FOUND` lines SHALL NOT have been emitted at INFO level for those events

#### Scenario: Non-matched-only interval omits EVENT_SUMMARY matches

- **GIVEN** 225 non-matched accounts recorded since the last heartbeat tick
- **AND** no manual, automatic-merge, or deferred match outcomes in that interval
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL NOT receive an `EVENT_SUMMARY matches` line
- **AND** the STATUS line SHALL still include pipeline progress delta and cumulative `matches(` totals

#### Scenario: Decision events summarized per tick

- **GIVEN** 1 new-identity decision and 1 merge decision applied since the last heartbeat tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO line containing `EVENT_SUMMARY decisions` with interval deltas
- **AND** per-decision `… DECISION APPLIED` headline lines SHALL have been emitted at INFO when each decision took effect

#### Scenario: Decision discovery and application logged at INFO

- **GIVEN** a finished review form selecting merge into an existing identity
- **WHEN** form data is processed during Fetch
- **THEN** the connector host SHALL receive an INFO line `MERGE DECISION DISCOVERED: …`
- **WHEN** the merge decision is layered onto the target fusion account during Refresh
- **THEN** the connector host SHALL receive an INFO line `MERGE DECISION APPLIED: …`

#### Scenario: Correlation events summarized per tick

- **GIVEN** 14 correlation triggers affecting 18 accounts since the last tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line reporting correlation totals

#### Scenario: Correlation link and merge summarized per tick

- **GIVEN** 14 link correlation triggers affecting 18 accounts and 2 merge correlation triggers affecting 2 accounts since the last tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line containing `correlations link=14/18 merge=2/2`
- **AND** per-account `Triggering correlation for` INFO lines SHALL NOT appear for those events

#### Scenario: Correlated-action grants summarized per tick

- **GIVEN** 12 correlated-action grants since the last heartbeat tick during a non-aggregation operation
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line containing a correlated-action count with interval delta
- **AND** account-list aggregation EVENT_SUMMARY segments SHALL NOT contain `correlated-action=`

#### Scenario: Correlation completed summarized per tick

- **GIVEN** 147 correlation PATCHes completed successfully since the last heartbeat tick
- **WHEN** the heartbeat flushes event counters
- **THEN** the connector host SHALL receive an INFO `EVENT_SUMMARY` line containing `completed=+147/` with interval seconds suffix

#### Scenario: Account-list aggregation excludes correlated-action from EVENT_SUMMARY

- **GIVEN** an account-list operation in aggregation mode with fusion accounts becoming fully correlated in output
- **WHEN** the heartbeat flushes correlation event counters
- **THEN** the `EVENT_SUMMARY` correlation segment SHALL NOT contain `correlated-action=`

---

### Requirement: Operation heartbeat detects and warns on queue stall

When the API queue `totalProcessed` (reported in STATUS as `api-queue completed`) count does not increase for two consecutive STATUS ticks while the queue has active or queued items, the heartbeat SHALL emit a `WARN STALL` line listing the top active queue item labels grouped by count. Pipeline progress delta SHALL NOT influence stall detection.

#### Scenario: Stall warning after flat api-queue completed count

- **GIVEN** api-queue stats show active or queued items
- **AND** `completed` count is unchanged across two consecutive STATUS ticks
- **WHEN** the second STATUS tick completes
- **THEN** the connector host SHALL receive a WARN line containing `STALL`
- **AND** the line SHALL name the most frequent active queue labels

#### Scenario: No stall when pipeline advances but api-queue is idle

- **GIVEN** Refresh phase pipeline progress increases each STATUS tick
- **AND** api-queue active and queued counts are zero with unchanged completed count
- **WHEN** multiple STATUS ticks occur
- **THEN** the connector host SHALL NOT receive a `WARN STALL` line solely because api-queue completed delta is zero

---

### Requirement: Phase and step boundaries use standardized text prefixes

The log service SHALL emit `PHASE` and `STEP` text lines at operation pipeline boundaries. Each line SHALL use `START` or `END` with optional detail suffix and mandatory `elapsed=` on END. Phase names SHALL use canonical labels: Setup, Fetch, Refresh, Process, Output. The report terminal block SHALL use `EPILOGUE` (not a phase number) with `START` and `END` lines. Colon-style phase timing lines (for example `PHASE 1: Setup and initialization (26.4S)`) SHALL NOT be emitted to the host.

#### Scenario: Phase start logged before work begins

- **GIVEN** the account-list operation enters Process phase
- **WHEN** processing begins
- **THEN** an INFO line `PHASE 4 Process START` SHALL be emitted before Process work starts

#### Scenario: Phase end logged when phase completes

- **GIVEN** Process phase work has completed
- **WHEN** the phase boundary closes
- **THEN** an INFO line `PHASE 4 Process END elapsed=` SHALL be emitted
- **AND** no colon-style `PHASE 4:` timing line SHALL be emitted

#### Scenario: Step start logged for uncorrelated sweep

- **GIVEN** the Process phase begins uncorrelated managed-account scoring for 800 accounts
- **WHEN** the sweep starts
- **THEN** an INFO line `STEP uncorrelated-sweep START` SHALL be emitted with account count detail

### Requirement: OperationRunContext tracks run state for heartbeat consumption

The service registry SHALL expose an `OperationRunContext` updated by log service helpers (`phaseStart`, `phaseEnd`, `stepStart`, `stepEnd`, `setProgress`, `recordEvent`, `recordCorrelationActivity`, `recordCorrelatedActionGranted`, `recordCorrelationSkipped`) and readable by the operation heartbeat within the active AsyncLocalStorage scope. The operation heartbeat SHALL track the previous pipeline progress `done` value alongside previous api-queue completed count for delta calculation. Automatic merge events SHALL be recorded under the category `autoMerged` (not `autoAssigned`). During Refresh phase, STATUS lines MAY include a cumulative correlation segment when link or merge activity has occurred in the phase.

#### Scenario: Progress update reflected in next STATUS line

- **GIVEN** a caller invokes `setProgress(450, 800, 'analyzed')`
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include `progress=450/800 analyzed`

#### Scenario: Progress delta uses previous tick baseline

- **GIVEN** progress was 450/800 at the previous STATUS tick
- **AND** a caller invokes `setProgress(570, 800, 'analyzed')` before the next tick
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a pipeline progress delta of `+120` over the heartbeat interval

#### Scenario: Automatic merge events use autoMerged category

- **GIVEN** the match engine records one or more automatic merges via `recordEvent('autoMerged')`
- **WHEN** the heartbeat emits EVENT_SUMMARY
- **THEN** the summary SHALL include an automatic-merge count derived from `autoMerged` events
- **AND** the summary SHALL NOT reference `autoAssigned`

### Requirement: Reviewer decision outcomes are logged and summarized

The log service SHALL emit INFO headline lines for fusion review decisions using standardized prefixes: `NEW IDENTITY DECISION`, `MERGE DECISION`, `NO-MATCH DECISION`, and `AUTO-MERGE DECISION`. Each headline SHALL suffix `DISCOVERED` when a finished form is parsed during Fetch and `APPLIED` when the decision takes effect (Refresh for merge, Process for new identity/no-match, or Process for automatic merge). Headlines SHALL include account label `[sourceName]`, merge target or reviewer name when available, and an outcome suffix on applied lines (for example `→ registered as fusion account`).

Decision metrics SHALL be recorded via `recordEvent('decision', { type })` with types `newIdentity`, `merge`, `noMatch`, and `autoMerge`. Cumulative decision counters SHALL appear in compact form `decisions(Nn/Mm/NMnm/Aa)` on STATUS lines during Process phase (when non-zero or during `process-decisions`), on phase-complete DETAIL lines, and in EVENT_SUMMARY as `decisions new-identity=… merge=… no-match=… auto-merge=…` with interval deltas.

#### Scenario: Decision segment on process phase complete

- **GIVEN** an account-list run applied 1 new-identity and 1 merge decision
- **WHEN** Process phase completes
- **THEN** the phase-complete DETAIL line SHALL include `decisions=decisions(1n/1m/0nm/0a total=2)`

#### Scenario: Refresh STATUS includes correlation segment

- **GIVEN** an account-list operation in Refresh phase with cumulative link correlation activity
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a correlation segment with link totals alongside `refreshed(N)`

### Requirement: Heartbeat interval is configurable in Advanced Connection Settings

The connector SHALL expose a **Heartbeat interval (seconds)** setting (`heartbeatInterval`) in Advanced Connection Settings. The setting SHALL default to 10 seconds when unset. At runtime the connector SHALL convert the configured value to milliseconds and expose it as `statsLoggingIntervalMs` on `FusionConfig` for operation heartbeat consumption.

#### Scenario: Default heartbeat interval when setting omitted

- **GIVEN** a source configuration with no `heartbeatInterval` value
- **WHEN** `safeReadConfig` completes
- **THEN** `statsLoggingIntervalMs` SHALL be 10000

#### Scenario: Custom heartbeat interval from advanced settings

- **GIVEN** a source configuration with `heartbeatInterval` set to 30
- **WHEN** `safeReadConfig` completes
- **THEN** `statsLoggingIntervalMs` SHALL be 30000

#### Scenario: Setting appears in connector-spec Advanced Connection Settings

- **GIVEN** an operator views Advanced Connection Settings in the connector UI
- **WHEN** the section renders
- **THEN** a **Heartbeat interval (seconds)** field keyed `heartbeatInterval` SHALL be present
- **AND** the documented default SHALL be 10 seconds

### Requirement: Log service emits DETAIL lines for operational milestones

The log service SHALL provide a `detail()` helper that emits INFO lines with prefix `DETAIL` followed by space-separated `key=value` pairs. Values containing spaces SHALL be quoted. During an operation with `operationContext`, DETAIL lines SHALL be prefixed with `[operationContext]`. During config bootstrap (before ServiceRegistry exists), DETAIL lines SHALL be prefixed with `[config]`.

#### Scenario: Detail line during account-list setup

- **GIVEN** the account-list operation is in Setup phase
- **WHEN** a caller invokes `log.detail({ sources: 3 })`
- **THEN** the connector host SHALL receive an INFO line `[accountList] DETAIL sources=3`

#### Scenario: Detail line during config bootstrap

- **GIVEN** configuration validation completes before any operation starts
- **WHEN** bootstrap logging records validation success
- **THEN** the connector host SHALL receive an INFO line prefixed with `[config] DETAIL`

### Requirement: Log service emits PHASE END and EPILOGUE END boundaries

The log service SHALL provide `phaseEnd(phaseNumber, phase, detail?)` that emits `PHASE {N} {Phase} END` with optional detail suffix and mandatory `elapsed=` duration since the matching `phaseStart`. When correlation activity occurred during the phase, the detail suffix SHALL include cumulative correlation totals using `link=`, `merge=`, `completed=`, and `skipped=` segments as applicable. During account-list aggregation, phase END correlation detail SHALL NOT include `correlated-action=`. The service SHALL provide `epilogueEnd(block, detail?)` that emits `EPILOGUE {block} END` with `elapsed=` duration since the matching epilogue START. Phase elapsed timing for HTML report breakdowns SHALL be captured via internal PhaseTimer recording without emitting colon-style `PHASE N: Description (elapsed)` host lines.

#### Scenario: Phase end logged after setup completes

- **GIVEN** Setup phase began with `PHASE 1 Setup START`
- **WHEN** Setup work completes and `phaseEnd(1, 'Setup')` is called
- **THEN** the connector host SHALL receive `[accountList] PHASE 1 Setup END elapsed=` with a duration suffix
- **AND** the connector host SHALL NOT receive a colon-style line matching `PHASE 1:`

#### Scenario: Refresh phase end includes link correlation totals

- **GIVEN** Refresh phase recorded 42 link correlation triggers affecting 56 accounts
- **WHEN** `phaseEnd(3, 'Refresh', detail)` is called with flushed correlation summary
- **THEN** the connector host SHALL receive `[accountList] PHASE 3 Refresh END correlations link=42/56 … elapsed=`
- **AND** the detail SHALL include cumulative phase totals not interval deltas

#### Scenario: Process phase end includes completed drain totals

- **GIVEN** Process phase enqueued 2000 link PATCHes and 147 completed before phase end
- **WHEN** `phaseEnd(4, 'Process', detail)` is called with flushed correlation summary
- **THEN** the phase END detail SHALL include `link=…` enqueue totals and `completed=147` when non-zero

#### Scenario: Epilogue end logged after report generation

- **GIVEN** the epilogue began with `EPILOGUE report START`
- **WHEN** report generation completes
- **THEN** the connector host SHALL receive `[accountList] EPILOGUE report END elapsed=`
- **AND** the connector host SHALL NOT receive a line starting with `Epilogue: report generation`

---

### Requirement: Non-accountList operations use STEP boundaries

Operations other than accountList (including accountCreate, accountEnable, accountDisable, accountRead, accountUpdate, testConnection, entitlementList, accountDiscoverSchema) SHALL emit `STEP {slug} START` and `STEP {slug} END elapsed=` lines at pipeline boundaries instead of colon-style PhaseTimer phase messages.

#### Scenario: Account create uses STEP lines

- **GIVEN** an accountCreate operation runs
- **WHEN** identity fetch completes
- **THEN** the connector host SHALL receive `STEP fetch-identity END elapsed=`
- **AND** the connector host SHALL NOT receive a line matching `Step 1:`

---

### Requirement: OperationRunContext tracks correlation activity counters

The service registry SHALL expose correlation activity counters on `OperationRunContext` updated via log service helpers `recordCorrelationActivity`, `recordCorrelationCompleted`, `recordCorrelatedActionGranted`, and `recordCorrelationSkipped`. Counters SHALL track PATCH subtypes **link** (correlation-on-aggregation) and **merge** (merge-decision-driven) separately, each with trigger count and account count. Counters SHALL track **linkCompleted** and **mergeCompleted** counts incremented when correlation PATCH promises resolve successfully. A **correlated-action** counter SHALL increment when the correlated action entitlement is newly granted during non-aggregation operations only; it SHALL NOT increment during account-list aggregation mode. Skip counters SHALL aggregate reasons: `noIdentity`, `noSourceContext`, `wrongMode`, `noIscAccountId`. The context SHALL maintain both interval counters (reset each heartbeat flush) and phase cumulative counters (reset at `phaseStart`, readable via `flushPhaseCorrelationSummary`).

#### Scenario: Link correlation activity recorded during Refresh

- **GIVEN** correlation-on-aggregation PATCH is triggered for 3 accounts on one fusion account during Refresh phase
- **WHEN** `recordCorrelationActivity({ kind: 'link', accounts: 3 })` is invoked
- **THEN** interval and phase cumulative link trigger counts SHALL increment by 1
- **AND** interval and phase cumulative link account counts SHALL increment by 3

#### Scenario: Correlation completed recorded on PATCH resolve

- **GIVEN** a link correlation PATCH for one managed account resolves successfully
- **WHEN** `recordCorrelationCompleted({ kind: 'link' })` is invoked
- **THEN** interval and phase cumulative linkCompleted counts SHALL increment by 1

#### Scenario: Correlated-action grant suppressed during aggregation

- **GIVEN** an account-list operation in aggregation mode
- **WHEN** a fusion account transitions to fully correlated output state via `updateCorrelationStatus`
- **THEN** correlated-action counters SHALL NOT increment
- **AND** output state update SHALL still occur

#### Scenario: Correlated-action grant recorded on transition

- **GIVEN** a non-aggregation operation where a fusion account transitions from having missing accounts to fully correlated
- **WHEN** `FusionAction.Correlated` is newly added and `recordCorrelatedActionGranted()` is invoked
- **THEN** correlated-action counters SHALL increment
- **AND** idempotent status recomputation without state change SHALL NOT increment the counter again

---

### Requirement: Heartbeat snapshot includes correlation queue pending count

The service registry heartbeat snapshot SHALL include a `correlationQueuePending` count derived from pending API queue items whose label matches the `IdentityService>correlateAccounts` prefix. The operation heartbeat SHALL use this count for STATUS `pending=` segments.

#### Scenario: Pending count reflects queued correlation PATCHes

- **GIVEN** the API queue has 1853 pending items labeled `IdentityService>correlateAccounts`
- **WHEN** `getHeartbeatSnapshot()` is called
- **THEN** `correlationQueuePending` SHALL be 1853

### Requirement: External logging SHALL route by connector role and proxy mode

When `externalProcessingEnabled` and `externalLoggingEnabled` are both true, the log service MUST route external log delivery based on connector role:

- **Proxy client** (`isProxyMode()` true): MUST NOT send external logs (noop).
- **Proxy server** (`isProxyService()` true): MUST append plain-text log lines to disk at `process.env.LOG_FILE` when set, otherwise `logs/<tenant>/fusion-{YYYYMMDD}.log` where `<tenant>` is a filesystem-safe slug derived from connection `baseurl` (first hostname label, sanitized; fallback `unknown-tenant`). The tenant subdirectory MUST be created automatically before the first append.
- **Direct ISC processing** (neither proxy client nor server): MUST HTTP POST plain-text log lines to `externalTargetUrl`. The external target password MUST be ignored for this path.

External logging MUST honor `externalLoggingLevel` for level filtering in all active paths. HTTP POST URLs MUST use http or https scheme validation (SSRF guard).

#### Scenario: Direct ISC processing posts logs to external target URL

- **GIVEN** `externalProcessingEnabled` and `externalLoggingEnabled` are `true`
- **AND** `externalProxyEnabled` is `false`
- **AND** `externalTargetUrl` is `https://logs.example.com/ingest`
- **AND** the connector is processing operations directly on ISC (not proxy client or server)
- **WHEN** `LogService` emits a log at or above the configured external level
- **THEN** it MUST HTTP POST a plain-text line to `externalTargetUrl`
- **AND** MUST NOT include the external target password in the request

#### Scenario: Proxy client does not external-log

- **GIVEN** `externalProcessingEnabled`, `externalProxyEnabled`, and `externalLoggingEnabled` are all `true`
- **AND** the connector is running as a proxy client on ISC
- **WHEN** `LogService` emits operational logs during a forwarded operation
- **THEN** it MUST NOT HTTP POST to the external target URL
- **AND** MUST NOT write to the disk log sink

#### Scenario: Proxy server appends logs to disk

- **GIVEN** `externalProcessingEnabled`, `externalProxyEnabled`, and `externalLoggingEnabled` are all `true`
- **AND** the connector is running as a proxy server (`PROXY_PASSWORD` is set)
- **AND** connection `baseurl` is `https://acme.api.identitynow.com`
- **AND** `LOG_FILE` is not set
- **WHEN** `LogService` emits a log at or above the configured external level
- **THEN** it MUST append a sanitized plain-text line to `logs/acme/fusion-{YYYYMMDD}.log`
- **AND** MUST NOT HTTP POST to the external target URL

#### Scenario: Proxy server uses unknown-tenant when baseurl is missing

- **GIVEN** the connector is running as a proxy server with external logging enabled
- **AND** connection `baseurl` is missing or unparseable
- **AND** `LOG_FILE` is not set
- **WHEN** `LogService` emits an external log line
- **THEN** it MUST append to `logs/unknown-tenant/fusion-{YYYYMMDD}.log`

#### Scenario: Proxy server honors LOG_FILE environment variable

- **GIVEN** the connector is running as a proxy server with external logging enabled
- **AND** `process.env.LOG_FILE` is `/var/log/fusion/connector.log`
- **WHEN** `LogService` emits an external log line
- **THEN** it MUST append to `/var/log/fusion/connector.log`
- **AND** MUST NOT inject a tenant subdirectory into the path

### Requirement: External logging config SHALL live in External Settings

External logging configuration MUST be read from External Settings: `externalProcessingEnabled`, `externalLoggingEnabled`, `externalLoggingLevel`, and `externalTargetUrl` (when proxy is off). The former keys `externalLoggingUrl` and Developer Settings placement SHALL NOT be used at runtime.

#### Scenario: Gateway off disables external logging

- **GIVEN** `externalProcessingEnabled` is `false`
- **AND** `externalLoggingEnabled` is stored as `true` in platform config
- **WHEN** `LogService` is constructed
- **THEN** external logging MUST be inactive

### Requirement: Tenant slug derivation for artifact paths SHALL use connection baseurl

The connector MUST expose a shared helper that derives a filesystem-safe tenant slug from connection `baseurl` for log and recording path resolution. The slug MUST be the first hostname label when the host is a conventional domain name. IPv4, IPv6, and bare-hostname inputs MUST be sanitized to filesystem-safe segments. When `baseurl` is missing, empty, or unparseable, the helper MUST return `unknown-tenant`.

#### Scenario: Standard ISC API URL yields tenant slug

- **GIVEN** connection `baseurl` is `https://acme.api.identitynow.com`
- **WHEN** the tenant slug helper is invoked
- **THEN** it MUST return `acme`

#### Scenario: Invalid baseurl yields fallback slug

- **GIVEN** connection `baseurl` is empty or not a valid URL
- **WHEN** the tenant slug helper is invoked
- **THEN** it MUST return `unknown-tenant`

### Requirement: STATUS SHALL render ingested progress the same way as fetched

When `log.setProgress` is invoked with unit `ingested`, the operation heartbeat SHALL include that progress on the STATUS line in the same shape as other units: `progress={done}/{total} ingested` with an optional delta suffix after the first tick. The heartbeat SHALL NOT emit a separate `INGEST` line kind. A DETAIL line MAY accompany ingest start; per-chunk INFO progress lines SHALL NOT be required.

#### Scenario: Ingested unit appears on STATUS like Fetch fetched

- **GIVEN** Fetch phase bulk ingest has called `setProgress(2500, 10000, 'ingested')`
- **WHEN** the operation heartbeat interval fires
- **THEN** the connector host SHALL receive an INFO STATUS line
- **AND** the line SHALL include `progress=2500/10000 ingested`

#### Scenario: Ingested progress delta uses previous tick baseline

- **GIVEN** progress was 2500/10000 ingested at the previous STATUS tick
- **AND** a caller invokes `setProgress(4000, 10000, 'ingested')` before the next tick
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a pipeline progress delta of `+1500` over the heartbeat interval

#### Scenario: Unit change from fetched to ingested resets delta baseline

- **GIVEN** the previous STATUS tick showed unit `fetched`
- **WHEN** the next tick shows unit `ingested`
- **THEN** the ingested progress delta suffix MAY be omitted on that first ingested tick
- **AND** subsequent ingested ticks SHALL include deltas against the ingested baseline

