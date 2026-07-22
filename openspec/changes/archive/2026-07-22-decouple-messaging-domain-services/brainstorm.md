# Brainstorming Log: Decoupling Messaging into Pure Domain Services

## Context & Problem Statement
`MessagingService` currently aggregates multiple distinct responsibilities: localized Handlebars template compilation, direct email transmission, workflow prefetching/execution payload building, and fusion report generation/delivery. This monolithic structure introduces unnecessary coupling across unrelated domains and complicates unit testing and service dependency injection.

## Objectives
1. Eliminate `MessagingService` and any backward-compatibility facades completely.
2. Introduce pure domain services: `WorkflowService`, `EmailService`, and `ReportService`.
3. Rewire dependency injection in `ServiceRegistry` and all callers (`FormService`, `FusionService`, operations, unit tests).

## Key Design Decisions & Alternatives

### Q1: Should backward-compatibility facades or deprecated wrappers be preserved?
- **Option A**: Retain a deprecated `MessagingService` facade delegating to the new domain services.
- **Option B**: Delete `MessagingService` completely without facades or wrappers (Chosen).
- **Rationale**: Complete removal guarantees zero architectural debt or legacy confusion.

### Q2: Where should template compilation and email sending reside?
- **Option A**: Combine template compilation into `ReportService` and `FormService` separately.
- **Option B**: Dedicated `EmailService` handling template compilation, localization, and sending via `ClientService` (Chosen).
- **Rationale**: `EmailService` becomes the single authority for email formatting and transport across all domains.

### Q3: Where should workflow discovery and delayed aggregation scheduling live?
- **Option A**: `WorkflowService` (Chosen).
- **Rationale**: `WorkflowService` encapsulates workflow prefetching (`fetchSender`, `fetchDelayedAggregationSender`) and SDK payload construction.

### Q4: How will `ReportService` interact with `EmailService`?
- **Option A**: `ReportService` delegates HTML rendering and email delivery to `EmailService`.
- **Rationale**: Keeps report lifecycle logic cohesive in `ReportService` while delegating raw email rendering/sending to `EmailService`.

## Summary
The team agrees to proceed with the total elimination of `MessagingService` and the implementation of clean domain boundaries across `WorkflowService`, `EmailService`, and `ReportService`.
