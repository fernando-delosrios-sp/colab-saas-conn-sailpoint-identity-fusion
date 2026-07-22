## Context

`MessagingService` historically served as a central monolithic dispatcher for workflow execution, Handlebars template compilation, localized email sending, and fusion report generation. This resulted in a bloated facade with scattered responsibilities. To establish a clean Service-Oriented Architecture (SOA), we are eliminating `MessagingService` completely and replacing it with three distinct domain services:

1. `WorkflowService`: Responsible for workflow discovery, sender prefetching, and delayed aggregation execution scheduling.
2. `EmailService`: Responsible for Handlebars template compilation, localization, and direct email transmission via `ClientService`.
3. `ReportService`: Responsible for fusion report building, HTML rendering via `EmailService`, disk persistence (`reports/`), and recipient delivery.

## Goals / Non-Goals

**Goals:**
- Completely eliminate `MessagingService` and any backward-compatibility facades.
- Create `EmailService` with a clean `sendEmail(recipients, subject, htmlBody)` and template rendering interface.
- Expand `WorkflowService` to encapsulate all workflow prefetching (`fetchSender`, `fetchDelayedAggregationSender`) and SDK payload building for delayed aggregation scheduling (`scheduleDelayedAggregation`).
- Update `ReportService` to collaborate directly with `EmailService` and `IdentityService` for rendering HTML reports and delivering them to identity owners/recipients.
- Refactor `ServiceRegistry` to inject `emailService` directly into `ReportService` and `FormService`.
- Update all callers, handlers, and test suites across the repository.

**Non-Goals:**
- Changing the underlying HTML structure or localized Handlebars templates.
- Changing the external SailPoint SDK workflow execution API contract.

## Decisions

### 1. Direct Service Consumption over Compatibility Facades
- **Decision**: Eliminate `MessagingService` entirely without retaining a deprecated wrapper.
- **Rationale**: Retaining facades creates tech debt and obscures architectural boundaries. Direct consumption enforces clear domain separation.
- **Alternatives Considered**: Deprecating `MessagingService` and delegating to new services (rejected: violates explicit requirement for clean SOA without backward-compatibility layers).

### 2. Pure `EmailService` Responsibility
- **Decision**: `EmailService` owns Handlebars template compilation, locale resolution, and sending via `ClientService`.
- **Rationale**: Isolates rendering and email transport from domain logic (reports and workflows).

### 3. Encapsulate Workflow Prefetching & Execution in `WorkflowService`
- **Decision**: Move `fetchSender`, `fetchDelayedAggregationSender`, and `scheduleDelayedAggregation` into `WorkflowService`.
- **Rationale**: Hides raw SDK payload construction and workflow execution body building behind a deep service interface.

### 4. `ReportService` Ownership of Delivery
- **Decision**: Move report HTML rendering (`renderReportHtml`) and recipient delivery (`deliverReport`) directly into `ReportService`.
- **Rationale**: Report lifecycle (building, rendering, saving, sending) belongs in the report domain service.

## Risks / Trade-offs

- **[Risk] Wide API Break across operations and tests**: Deleting `MessagingService` breaks all files importing it.
  - *Mitigation*: Update `ServiceRegistry`, `FormService`, `FusionService`, and all unit tests in a single atomic refactor verified by `npm test`.
