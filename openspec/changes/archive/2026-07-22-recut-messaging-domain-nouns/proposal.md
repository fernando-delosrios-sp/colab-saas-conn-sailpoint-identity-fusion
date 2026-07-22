## Why

`MessagingService` currently mixes form email rendering, workflow scheduling, report rendering/delivery, and filesystem operations across ~20 public methods. It imports match-scoring internals and review-form structures, while report rendering logic is fragmented across 4 locations in 3 directories. Re-cutting these responsibilities along domain nouns improves code locality, eliminates type leaks, and provides clean, focused interfaces.

## What Changes

Re-cut `MessagingService` and fragmented report utilities into three domain-aligned modules:

**Messaging Service / Email Renderer**
- From: Mixed service handling emails, workflow scheduling, report directory creation, and report rendering.
- To: `EmailRenderer` focused strictly on email templates, locales, and body formatting.
- Reason: Remove report and workflow concerns from email messaging.
- Impact: Non-breaking internally, refactors helper invocation.

**Report Module (`ReportService`)**
- From: Report rendering scattered across `messagingService`, `reportService.ts`, `fusionReportBuilder.ts`, and dry-run operation helpers.
- To: A single unified Report module owning report building, rendering (HTML/PDF), directory management (`mkdir`), and delivery.
- Reason: Single source of truth for report lifecycle and layout.
- Impact: Non-breaking, deletes duplicate `mkdir` and redundant report rendering functions.

**Workflow Service (`WorkflowService`)**
- From: Workflow scheduling embedded inside `MessagingService` via raw workflow pass-through methods.
- To: `WorkflowService` owning delayed workflow scheduling and execution.
- Reason: Decouple workflow execution lifecycle from email/report formatting.
- Impact: Non-breaking, simplifies workflow call sites.

## Capabilities

### New Capabilities
- `workflow-service`: Owns scheduling and execution of delayed identity workflows and aggregation tasks.

### Modified Capabilities
- `messaging-service`: Narrowed to email rendering, Handlebars templates, locales, and cell truncation.
- `report-service`: Expanded to cover end-to-end report building, rendering, directory setup, and delivery.

## Impact

- Refactors `src/services/messagingService/` (2,117 lines) into distinct domain modules.
- Consolidates `src/services/reportService.ts`, `src/services/fusionService/fusionReportBuilder.ts`, `src/operations/helpers/generateReport.ts`, `dryRunHelpers.ts`, `buildDryRunPayload.ts`.
- Updates call sites in operations (`src/operations/`) and `FormService` (`src/services/formService/formService.ts`).
