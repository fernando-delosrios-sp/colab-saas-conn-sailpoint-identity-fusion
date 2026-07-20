# Proposal: Complete FusionRun Cleanup — Sync Specs to Code

## Why

The `extract-map-define-match-services` change moved core state from `FusionService` to `FusionRun`. Two follow-up cleanup rounds completed remaining items (processor decoupling, sourcesByName migration, CorrelationManager decoupling). The active specs still reference pre-cleanup patterns.

## What Changes

Sync `fusion-service` and `fusion-run` specs to match current code reality — no new requirements, documentation alignment only.
