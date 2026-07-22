## 1. Domain Service Implementation & Refactoring

- [x] 1.1 Create `EmailService` (`src/services/emailService/emailService.ts`) with template compilation, localization, and direct sending via `ClientService`.
- [x] 1.2 Deepen `WorkflowService` (`src/services/workflowService/workflowService.ts`) to handle workflow discovery, sender prefetching, delayed aggregation execution scheduling, and SDK payload construction.
- [x] 1.3 Upgrade `ReportService` (`src/services/reportService.ts`) to collaborate with `EmailService` and `IdentityService` for report HTML rendering (`renderReportHtml`) and recipient delivery (`deliverReport`).
- [x] 1.4 Delete `MessagingService` (`src/services/messagingService/messagingService.ts`).

## 2. Service Registry & Dependency Injection

- [x] 2.1 Refactor `ServiceRegistry` (`src/services/serviceRegistry.ts`) to remove `messaging`, instantiate `emailService`, and inject it into `ReportService` and `FormService`.
- [x] 2.2 Update `FormService` (`src/services/formService/formService.ts`) constructor dependencies to take `emailService` or `workflowService` directly.

## 3. Caller Rewiring & Operation Cleanup

- [x] 3.1 Update operations (`accountList`, `accountRead`, etc.) and callers across `FusionService` to consume domain services directly.

## 4. Test Suite Refactoring & Verification

- [x] 4.1 Refactor unit tests under `src/services/messagingService/__tests__/` to directly test `EmailService`, `WorkflowService`, or `ReportService`.
- [x] 4.2 Run unit test suite `npx vitest run src/services/` and verify clean passing.
- [x] 4.3 Run full test suite `npm test` and `npm run lint` to verify build integrity and type safety.
