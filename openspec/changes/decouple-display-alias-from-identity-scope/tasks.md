## 1. Override gate

- [x] 1.1 In `shouldApplyDisplayAttributeOverride`, remove the `identityInputsEnabled` early return; keep identity-origin (`fromIdentity` / `FusionAccountKind.Identity`) and managed-origin `isIdentity` eligibility (D1, D3)
- [x] 1.2 Leave `buildVelocityContext` and `ensureCoreSchemaAttributes` on `identityInputsEnabled` unchanged
- [x] 1.3 Update the JSDoc on `shouldApplyDisplayAttributeOverride` so it no longer implies identity scope must be on

## 2. Absent-alias fall-through

- [x] 2.1 Change `applyDisplayAttributeOverrideIfApplicable` to return false when `identityAlias` is absent so Normal definitions still evaluate (D2)
- [x] 2.2 Change Unique display-attribute handling so an eligible account with no alias does not return early; definition evaluation and `fusionAttributeSafeDefault` still run (D2)

## 3. Tests

- [x] 3.1 Identity scope off + Unique display definition + correlated managed origin → alias wins
- [x] 3.2 Identity scope off + Normal display definition + correlated managed origin → alias wins
- [x] 3.3 Identity scope off + correlated managed origin + no alias + non-empty display definition → definition value, attribute not empty
- [x] 3.4 Identity scope off + correlated managed origin + no alias + empty display definition → core-schema safe default
- [x] 3.5 Identity scope off + uncorrelated managed origin with identity layer → definition value (existing uncorrelated cases remain)
- [x] 3.6 Identity scope off + persisted Fusion account from `fromFusionAccount` with a stored display value → value unchanged
- [x] 3.7 Keep existing identity-scope-off `$identity.department` case; add Identities origin snapshot exclusion and identity-alias-not-in-Velocity cases
- [x] 3.8 Identity scope on + correlated managed origin → alias still applied (July-fix regression)
- [x] 3.9 Identity-origin support account with identity scope off → identity context and alias override still apply
- [x] 3.10 Run `npm test -- src/services/definitionService/__tests__/defineService.test.ts`

## 4. Verification

- [ ] 4.1 Confirm canonical test command: `npm test`
- [ ] 4.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)
- [ ] 4.3 Run `npm run lint` and fix issues

## 5. Documentation

- [x] 5.1 Update `docs/use-guides/configuration/configuring-sources-and-scope.md` “When disabled” list: display attribute override still uses the identity alias for correlated managed source accounts (D4)
- [x] 5.2 Update `docs/use-guides/configuration/defining-attributes.md`: a display-attribute definition does not win over the alias on correlated accounts, independently of identity scope
- [x] 5.3 Note in those guides that persisted Fusion accounts keep their existing display values (Q6 out of scope; D5 carve-out not presented as fixed)
- [x] 5.4 Run `npm run lint:docs-guides` and `npm run lint:markdown` if those files changed

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via **changelog-generator**
- [x] 6.2 Confirm entry covers newly created correlated Fusion accounts taking the identity alias when identity scope is off, and that persisted accounts are unchanged
