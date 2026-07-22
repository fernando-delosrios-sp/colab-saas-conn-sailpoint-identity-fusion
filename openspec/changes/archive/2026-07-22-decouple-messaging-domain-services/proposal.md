## Why

Messaging, workflow execution, template compilation, and report generation were previously tangled within `MessagingService` and legacy facade layers. This violated single-responsibility principles, inflated interface surface areas, and introduced unnecessary cross-domain coupling. Completely eliminating `MessagingService` in favor of clean, dedicated domain services (`WorkflowService`, `EmailService`, and `ReportService`) establishes clear domain boundaries, improves testability, and deepens module interfaces.

## What Changes

- **DELETE**: Completely remove `MessagingService` (`src/services/messagingService/messagingService.ts`) and all backward-compatibility facades or wrappers (**BREAKING**).
- **NEW**: Create `EmailService` (`src/services/emailService/emailService.ts`) to handle template compilation, localization, and direct email sending via `ClientService`.
- **MODIFY**: Deepen `WorkflowService` (`src/services/workflowService/workflowService.ts`) to encapsulate workflow prefetching (`fetchSender`, `fetchDelayedAggregationSender`), delayed aggregation scheduling (`scheduleDelayedAggregation`), and SDK workflow payload execution.
- **MODIFY**: Upgrade `ReportService` (`src/services/reportService.ts`) to directly collaborate with `EmailService` and `IdentityService`, handling report HTML rendering (`renderReportHtml`) and recipient delivery (`deliverReport`).
- **MODIFY**: Update `ServiceRegistry` (`src/services/serviceRegistry.ts`) to instantiate and inject `emailService` directly into `ReportService` and `FormService`, removing `MessagingService`.
- **MODIFY**: Update callers across `FormService`, `FusionService`, operations, and unit tests to consume `WorkflowService`, `EmailService`, and `ReportService` directly.

## Capabilities

### New Capabilities

- `email-service`: Pure service for localized Handlebars template compilation and email sending via `ClientService`.

### Modified Capabilities

- `workflow-service`: Extends `WorkflowService` to encapsulate workflow prefetching (`fetchSender`, `fetchDelayedAggregationSender`) and delayed aggregation scheduling (`scheduleDelayedAggregation`).
- `report-service`: Upgrades `ReportService` to handle report HTML rendering via `EmailService` and recipient delivery via `IdentityService`.

### Removed Capabilities

- `messaging-service`: Completely removed `MessagingService` facade in favor of `email-service`, `workflow-service`, and `report-service`.

## Impact

- `src/services/messagingService/messagingService.ts` will be deleted.
- `src/services/emailService/emailService.ts` created.
- `src/services/workflowService/workflowService.ts`, `src/services/reportService.ts`, `src/services/serviceRegistry.ts`, and `src/services/formService/formService.ts` updated.
- All callers and tests referencing `MessagingService` updated to use the new domain services directly.
