# Tasks: Move Form State to FusionRun

## FusionRun

- [ ] 1.1 Add 4 fields to FusionRun class: `fusionIdentityDecisions`, `pendingCandidateIdentityIds`, `pendingReviewUrlsByReviewerId`, `pendingReviewUrlsByCandidateId`
- [ ] 1.2 Update FusionRun unit tests

## FormService

- [ ] 2.1 Accept `run: FusionRun` in constructor (or inject per-method)
- [ ] 2.2 Replace `this._fusionIdentityDecisions` reads/writes with `this.run.fusionIdentityDecisions`
- [ ] 2.3 Replace `this._pendingCandidateIdentityIds` with `this.run.pendingCandidateIdentityIds`
- [ ] 2.4 Replace `this._pendingReviewUrlsByReviewerId` with `this.run.pendingReviewUrlsByReviewerId`
- [ ] 2.5 Replace `this._pendingReviewUrlsByCandidateId` with `this.run.pendingReviewUrlsByCandidateId`
- [ ] 2.6 Remove public getters for these 4 fields
- [ ] 2.7 Update `resetFormDataState()` to clear run fields

## Callers

- [ ] 3.1 Update FusionService: replace `this.forms.fusionIdentityDecisions` → `this.run.fusionIdentityDecisions`
- [ ] 3.2 Update FusionService: replace `this.forms.pendingCandidateIdentityIds` → `this.run.pendingCandidateIdentityIds`
- [ ] 3.3 Update FusionService: replace `this.forms.pendingReviewUrlsByReviewerId` → `this.run.pendingReviewUrlsByReviewerId`
- [ ] 3.4 Update DecisionProcessor: replace form state accesses via `this.run`
- [ ] 3.5 Update FormService constructor call in ServiceRegistry

## Specs

- [ ] 4.1 Update fusion-run spec: add 4 new fields
- [ ] 4.2 Update form-service spec: remove getter requirements, document run dependency

## Verification

- [ ] 5.1 Run tests (671 → 671)
- [ ] 5.2 Run typecheck
- [ ] 5.3 Run lint
