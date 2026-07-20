# Tasks: Extract Matching Components

## Move Files

- [ ] 1.1 Move `managedAccountAnalyzer.ts` → `src/services/matchingService/`
- [ ] 1.2 Move `candidateRegistry.ts` → `src/services/matchingService/`
- [ ] 1.3 Move `managedAccountMatchingRunner.ts` → `src/services/matchingService/`

## Update Imports

- [ ] 2.1 Fix relative imports in moved files (e.g., `../../model/config` → `../../model/config`, adjust for new location)
- [ ] 2.2 Update `fusionService.ts` imports to point to matchingService/
- [ ] 2.3 Update `managedAccountAnalysisRecorder.ts` imports
- [ ] 2.4 Update `helpers.ts` imports
- [ ] 2.5 Update matchingService/index.ts barrel export
- [ ] 2.6 Update test file imports

## Specs

- [ ] 3.1 Update matching-service spec: document new components
- [ ] 3.2 Update fusion-service spec: remove references to moved components

## Verification

- [ ] 4.1 Run tests
- [ ] 4.2 Run typecheck
- [ ] 4.3 Run lint
