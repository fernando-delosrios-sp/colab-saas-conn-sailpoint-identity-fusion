## Context

Currently, `FusionService`, `IdentityProcessor`, `DecisionProcessor`, and `ManagedAccountOutcomeHandler` each contain duplicate implementations of account assembly logic. This includes:
- Checking aggregation account list mode (`isAggregationAccountListMode`) across 4 files
- Determining pruning of deleted managed accounts (`shouldPruneDeletedManagedAccounts`) across 3 files
- Applying Map/Define attribute processing (`applyAttributeProcessing`) across 3 files
- Invoking `addManagedAccountLayer` with `skipBlendHistoryForManagedKeys` normalization across 3 files

This duplication leads to code drift and requires changes to account assembly to be duplicated across multiple locations.

## Goals / Non-Goals

**Goals:**
- Extract a single `AccountAssembly` collaborator in `src/services/accountAssembly/`.
- Move mode gating, layer application, attribute processing (Map/Define), and registration into `AccountAssembly`.
- Refactor `FusionService`, `IdentityProcessor`, `DecisionProcessor`, and `ManagedAccountOutcomeHandler` to use `AccountAssembly`.
- Add dedicated unit tests for `AccountAssembly` to verify layer assembly, pruning, and mode gates independently.

**Non-Goals:**
- Changing external API schemas or identity model data structures.
- Altering the business logic of attribute mapping/definition engines.

## Decisions

### D1: Extract `AccountAssembly` as a dedicated domain collaborator
- **Choice**: Create `AccountAssembly` in `src/services/accountAssembly/` owning the step-by-step account assembly pipeline.
- **Reason**: Consolidates ~15 duplicated blocks into one well-tested module.
- **Considered alternatives**: Utility function module (rejected because assembly requires stateful context/service references such as attribute service and source config).

### D2: Unified parameter interface for account assembly
- **Choice**: Pass context options and processor inputs into `AccountAssembly.assemble(...)`.
- **Reason**: Keeps processor call-sites clean while allowing each processor to specify what varies (e.g. source account list, identity context, outcome triggers).
- **Considered alternatives**: Inheriting from a base processor class (rejected in favor of composition over inheritance).

## Risks / Trade-offs

- [Risk] Unintended behavior divergence if processor variations are not accurately captured → Mitigation: Comprehensive unit test suite covering `AccountAssembly` alongside existing integration test suite execution before merging.

## Migration Plan

N/A — Internal refactoring with zero breaking changes or external state migrations.

## Open Questions

None.
