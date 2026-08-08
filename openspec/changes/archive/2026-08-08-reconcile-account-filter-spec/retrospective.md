# Retrospective: reconcile-account-filter-spec

## Outcome

Spec-only change completed successfully. No production code modified.

## What worked

- Exploration clarified owner intent: "filter criteria" meant **Accounts API filter** in source configuration, not `StdAccountListInput` filters.
- OpenSpec REMOVED-scenario marker pattern (`- **REMOVED** — superseded by …`) satisfied strict validate when replacing scenarios inside MODIFIED requirements.

## What we learned

- Spec drift audits that compare account-list handler code to filter scenarios can false-positive when filtering is delegated to SourceService at Fetch time.
- The source-service spec had conflated ISC search syntax with JMESPath; splitting scenarios prevents repeat confusion.

## Follow-ups

- None required for behavior. Optional: refresh spec drift audit high-severity count after this merge.
