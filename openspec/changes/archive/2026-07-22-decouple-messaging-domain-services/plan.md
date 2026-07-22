# Decouple Messaging into Pure Domain Services Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Decouple messaging, workflow execution, and reporting into pure domain services (`WorkflowService`, `EmailService`, `ReportService`) and completely eliminate `MessagingService`.

**Architecture:** Domain-driven services with clean interfaces, single responsibilities, and direct dependency injection via `ServiceRegistry`. `EmailService` handles template compilation and email sending; `WorkflowService` handles workflow discovery and delayed aggregation scheduling; `ReportService` handles fusion report assembly and email delivery.

**Tech Stack:** TypeScript, Node.js, Handlebars, Vitest.

---

## Task 1: Create `EmailService` and Expand `WorkflowService` & `ReportService`

- [ ] **Step 1:** Create `EmailService` in `src/services/emailService/emailService.ts` with template compilation, localization, and direct sending via `ClientService`.
- [ ] **Step 2:** Deepen `WorkflowService` in `src/services/workflowService/workflowService.ts` with `fetchSender`, `fetchDelayedAggregationSender`, and `scheduleDelayedAggregation`.
- [ ] **Step 3:** Upgrade `ReportService` in `src/services/reportService.ts` to include `renderReportHtml` and `deliverReport` collaborating with `EmailService` and `IdentityService`.
- [ ] **Step 4:** Delete `src/services/messagingService/messagingService.ts`.

## Task 2: Service Registry & Dependency Wiring

- [ ] **Step 1:** Update `ServiceRegistry` (`src/services/serviceRegistry.ts`) to remove `messaging`, instantiate `emailService`, and pass it to `ReportService` and `FormService`.
- [ ] **Step 2:** Refactor `FormService` (`src/services/formService/formService.ts`) to receive `emailService` or `workflowService` directly.

## Task 3: Caller & Operation Refactoring

- [ ] **Step 1:** Update all connector operations and `FusionService` methods to use `WorkflowService`, `EmailService`, or `ReportService` directly.

## Task 4: Unit Test Suite Refactoring & Full Verification

- [ ] **Step 1:** Update unit tests in `src/services/messagingService/__tests__/` to target `EmailService`, `WorkflowService`, or `ReportService`.
- [ ] **Step 2:** Run `npx vitest run src/services/` to verify service tests pass cleanly.
- [ ] **Step 3:** Run `npm test` and `npm run lint` to confirm full suite success and zero type errors.
