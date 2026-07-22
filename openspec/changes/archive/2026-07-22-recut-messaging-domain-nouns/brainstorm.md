# Brainstorm: Re-cut Messaging Along Domain Nouns

## Problem Statement

`MessagingService` cannot answer "what is a message?" without also answering "what is a report directory?". It mixes form email, delayed-aggregation workflow scheduling, report rendering/delivery, and filesystem duties (~20 public methods). It imports match-scoring internals, receives review-form structure from `FormService`, and report rendering currently lives across four places in three directories:
- `src/services/messagingService/`
- `src/services/reportService.ts`
- `src/services/fusionService/fusionReportBuilder.ts`
- `src/operations/helpers/generateReport.ts`, `dryRunHelpers.ts`, `buildDryRunPayload.ts`

## Goals & Key Principles

1. **Locality**: Unify report shape, construction, rendering, and delivery into a single dedicated `reportService` / Report module.
2. **Decouple Types**: Eliminate leaks of match-scoring internals and review-form structures into the messaging service.
3. **Focused Interfaces**: Replace a bloated ~20 method `MessagingService` with 3 single-responsibility modules defined around domain nouns:
   - `WorkflowService`: Schedule and execute delayed workflows/aggregation tasks.
   - `EmailRenderer`: Handle email template compilation, localization, and body formatting.
   - `ReportModule` (`ReportService`): Build, render, and deliver reports (including directory management and filesystem interaction).
4. **Delete Redundancy**: Eliminate duplicate `mkdir` and report rendering helpers across the codebase.

## Decision Chain & Trade-offs

### Decision 1: High-Level Module Boundaries
- **Option A**: Refactor `MessagingService` in place while keeping all helper methods under the same service directory.
- **Option B (Chosen)**: Break down `MessagingService` into three clean modules aligned with domain nouns (`WorkflowService`, `EmailRenderer`, `ReportService`).
- **Rationale**: Option B enforces strict boundaries, prevents cross-domain type bleeding, and simplifies testing and maintenance.

### Decision 2: Report Module Ownership
- **Option A**: Keep report payload building in `fusionService` and rendering in `reportService`.
- **Option B (Chosen)**: Consolidated Report module owning build, render, and delivery.
- **Rationale**: Eliminates the current fragmentation where report rendering lives across 4 different locations.

### Decision 3: Migration Strategy
- Re-export or adapt existing entry points temporarily during refactoring to prevent regressions in operation callers, then clean up unused interfaces once operations call the new modules directly.

## Design Trade-offs Summary
- **Pros**: Clear single responsibility for each module, reduced public surface area (from ~20 methods down to clean focused interfaces), zero match/form type leakage into email/messaging.
- **Cons**: Minor churn across operations that instantiate or invoke `MessagingService`, requiring updates to injection/instantiation sites.
