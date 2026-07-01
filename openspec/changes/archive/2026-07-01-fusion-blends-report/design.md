## Context

When the connector identifies that a managed account (e.g., from an Active Directory source) belongs to an existing Fusion account, it automatically merges them. This is currently referred to as "association" in the codebase, and the event is logged as `Associated managed account...` in the history string list. 

There are two primary issues:
1. **Confusing Terminology**: "Association" is a widely overloaded term in SailPoint and IAM. Changing this to "blending" specifically denotes the merging of managed account records into the consolidated Fusion account mapping.
2. **Lack of Visibility**: Users currently cannot see these automatic blending events in the execution report. They can see manual "FUSION REVIEW DECISIONS", but the silent, automatic blending events remain hidden in the backend execution logs.

## Goals / Non-Goals

**Goals:**
- Uniformly rename the concept of "associating" a managed account to a Fusion account to "blending" in code, configurations, and user-facing logs.
- Provide full visibility of these events by logging them to a new "FUSION BLENDS" section in the email report.
- Present the "FUSION BLENDS" UI block identically to the existing "FUSION REVIEW DECISIONS" block, so users immediately understand what happened.

**Non-Goals:**
- This design does not change the core matching or correlation algorithms. It only changes the terminology and how the execution outcome is reported to the end user.
- We will not rename properties in the SailPoint API context (e.g., identity correlation logic), only our internal Fusion structures and report models.

## Decisions

### Decision 1: Report Data Payload Expansion
**Context**: To show "FUSION BLENDS" in the HTML report, the `FusionReport` interface must transport this data to the Handlebars rendering engine.
**Decision**: Add an array of `fusionBlends?: FusionReportBlend[]` to the `FusionReport` type. A `FusionReportBlend` will contain:
- `accountName`: the target Fusion account name
- `accountUrl`: the link to the Fusion account (if applicable)
- `blendedAccountName`: the label of the managed account that was absorbed
- `blendedSource`: the name of the source the absorbed account came from.
**Rationale**: This structure parallels `FusionReportDecision` to allow the Handlebars template to loop over the blends easily.

### Decision 2: Tracking Blends In-Memory
**Context**: The report is generated at the end of the run. We need to collect blend events as they happen.
**Decision**: During `setManagedAccount`, when a new managed account key is added and `recordAssociationHistory` is true, we will push an event object to an internal `tracker.fusionBlends` array in `fusionService.ts` before returning.
**Rationale**: This leverages the existing telemetry tracking (`this.tracker`) and doesn't pollute the generic account data models with report-specific transient data.

### Decision 3: "Blending" Terminology Updates
**Context**: Methods like `addAssociationHistory`, `skipAssociationHistoryForManagedKeys` exist on `FusionAccount` and `FusionAccountMatcher`.
**Decision**: Rename these to `addBlendHistory` and `skipBlendHistoryForManagedKeys`. Update the generated history string from `Associated managed account...` to `Blended managed account...`.
**Rationale**: Ensures consistency between the new report UI ("FUSION BLENDS") and the codebase vocabulary.

## Risks / Trade-offs

- **Risk: Breaking Tests** → Many unit tests may assert on the exact phrase `Associated managed account`. 
  *Mitigation*: We must do a comprehensive search-and-replace in the `__tests__` directories to update these assertions to `Blended managed account`.
- **Risk: Increased Report Payload Size** → If an aggregation run blends thousands of accounts, the report payload and resulting HTML email could become too large.
  *Mitigation*: We can limit the number of reported blends to a sensible cap (e.g., top 100) or chunk them similar to how processing stats are currently handled. If necessary, we can add a configuration setting to limit report verbosity.
