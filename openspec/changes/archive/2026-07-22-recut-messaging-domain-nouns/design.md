## Context

`MessagingService` currently contains ~2,117 lines and ~20 public methods. It handles form email rendering, delayed-aggregation workflow scheduling, report rendering/delivery, and directory management (`mkdir`). Additionally, report rendering logic is scattered across four locations:
- `src/services/messagingService/`
- `src/services/reportService.ts`
- `src/services/fusionService/fusionReportBuilder.ts`
- `src/operations/helpers/generateReport.ts`, `dryRunHelpers.ts`, `buildDryRunPayload.ts`

Furthermore, `MessagingService` leaks internals by importing match-scoring internal types and receiving review-form structures from `FormService`.

## Goals / Non-Goals

**Goals:**
- Recut messaging responsibilities into three separate domain-noun modules: `WorkflowService`, `EmailRenderer` (or refactored `MessagingService`), and `ReportService`.
- Consolidate all report building, rendering (HTML/PDF), directory setup, and delivery into a single unified `ReportService`.
- Decouple form and match-scoring types from email rendering interfaces.
- Delete duplicated `mkdir` and redundant report rendering helpers.

**Non-Goals:**
- Changing external API contracts or SailPoint connector SDK event schemas.
- Modifying email template visual layouts or Handlebars template content unless required for refactoring.

## Decisions

### D1: Domain-Noun Module Separation
- **Choice**: Separate `MessagingService` into `WorkflowService` (workflow scheduling/execution), `EmailRenderer` (email template rendering and Handlebars helpers), and `ReportService` (report build/render/delivery).
- **Reason**: Aligns each class with a single domain noun, reducing method bloat (from 20+ methods to focused interfaces).
- **Considered alternatives**:
  - *Keep a single MessagingService class*: Rejected because it maintains mixed concerns and high coupling.

### D2: Unified Report Lifecycle Ownership
- **Choice**: Centralize report creation, data assembly (`fusionReportBuilder`), rendering (`generateReport`), directory management, and delivery into `src/services/reportService/` (or `ReportService`).
- **Reason**: Establishes a single source of truth for report generation and removes scattered report logic from operations and dry-run helpers.
- **Considered alternatives**:
  - *Keep report building in fusionService*: Rejected because report formatting and rendering naturally belong together in the report domain module.

### D3: Type Decoupling & Seam Cleanliness
- **Choice**: Pass clean, domain-specific DTOs to `EmailRenderer` rather than passing raw `FormService` review forms or match-scoring internal objects.
- **Reason**: Prevents type leakage across module seams.
- **Considered alternatives**:
  - *Pass full review form objects*: Rejected due to tight coupling between form generation and email rendering.

## Risks / Trade-offs

- [Risk] Broad call-site churn across operations calling messaging or report functions -> Mitigation: Perform surgical updates across all operations and verify with full unit test suite (`npm test`).
- [Trade-off] Additional service classes (`WorkflowService`, `EmailRenderer`, `ReportService`) -> Accepted because it significantly improves single responsibility and maintainability.

## Migration Plan

1. Create `WorkflowService`, `EmailRenderer` (or updated `MessagingService`), and consolidate `ReportService`.
2. Move workflow scheduling methods to `WorkflowService`.
3. Move report rendering and directory management to `ReportService`.
4. Update operation handlers and dry-run helpers to use the new domain services.
5. Delete duplicate `mkdir` and old unused report helpers.
6. Verify via `npm run lint` and `npm test`.

## Open Questions

None.
