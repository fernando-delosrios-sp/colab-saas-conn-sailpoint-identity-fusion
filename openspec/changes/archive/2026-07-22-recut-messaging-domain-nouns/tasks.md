## 1. Domain Service Extraction & Module Structure

- [x] 1.1 Create `WorkflowService` to encapsulate delayed workflow scheduling and execution logic.
- [x] 1.2 Refactor `MessagingService` into `EmailRenderer` focused strictly on email formatting, Handlebars templates, locales, and cell truncation.
- [x] 1.3 Consolidate report building, rendering (HTML/PDF), directory setup (`mkdir`), and delivery into `ReportService`.

## 2. Decouple Seams & Remove Duplicate Logic

- [x] 2.1 Refactor email rendering call sites to pass domain DTOs instead of raw form structures or match-scoring internal types.
- [x] 2.2 Remove duplicate `mkdir` calls and redundant report rendering functions across `fusionReportBuilder`, operation helpers, and dry-run builders.

## 3. Operation Call Site Updates & Integration

- [x] 3.1 Update operations and helper modules to instantiate and call `WorkflowService`, `EmailRenderer`, and `ReportService` directly.
- [x] 3.2 Update JSDoc comments, service registry exports, and documentation to reflect the new domain services.

## 4. Verification

- [x] 4.1 Run `npm run lint` and verify clean TypeScript type checks across all domain services.
- [x] 4.2 Run `npm test` to verify all unit test suites pass.
