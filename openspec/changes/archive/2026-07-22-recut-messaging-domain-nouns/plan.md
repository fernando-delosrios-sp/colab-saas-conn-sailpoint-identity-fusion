# Re-cut Messaging Along Domain Nouns Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Re-cut `MessagingService` and scattered report/workflow logic into three clean domain-aligned modules (`WorkflowService`, `EmailRenderer`, `ReportService`) to eliminate type leaks and code duplication.

**Architecture:** Split messaging service capabilities across domain boundaries. `WorkflowService` handles scheduling and execution of delayed identity workflows. `EmailRenderer` (refactored `MessagingService`) handles Handlebars email templates, localization, and attribute cell display truncation. `ReportService` centralizes report data assembly, HTML/PDF rendering, directory creation (`mkdir`), and delivery.

**Tech Stack:** TypeScript, Node.js, Handlebars, Vitest.

---

## Task 1: Domain Service Extraction & Module Structure

- [ ] **Step 1:** Create `src/services/workflowService/workflowService.ts` and re-export via `index.ts`. Move workflow scheduling logic from `MessagingService`.
- [ ] **Step 2:** Refactor `src/services/messagingService/` into `EmailRenderer` (or narrow `MessagingService`), extracting email rendering, Handlebars helpers, and localization while removing report and workflow methods.
- [ ] **Step 3:** Consolidate report construction (`fusionReportBuilder`), rendering (`generateReport`), directory management (`mkdir`), and delivery into `src/services/reportService/`.

## Task 2: Decouple Seams & Remove Duplicate Logic

- [ ] **Step 1:** Define clean DTO interfaces for email rendering to eliminate imports of `FormService` review forms and `MatchingService` scoring internals.
- [ ] **Step 2:** Remove duplicate `mkdir` logic and redundant report rendering functions across `fusionReportBuilder`, operation helpers (`generateReport.ts`), and dry-run builders.

## Task 3: Operation Call Site Updates & Integration

- [ ] **Step 1:** Update operation handlers in `src/operations/` and helper modules to call `WorkflowService`, `EmailRenderer`, and `ReportService` directly.
- [ ] **Step 2:** Update service registry exports, JSDoc annotations, and module documentation across changed files.

## Task 4: Verification

- [ ] **Step 1:** Run `npm run lint` to verify type safety and clean ESLint check.
- [ ] **Step 2:** Run `npm test` to verify all test suites pass without regression.
