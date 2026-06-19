## 1. Implement code changes

- [x] 1.1 Promote `$name` and `$identity.name` in `AttributeService.buildVelocityContext`.
- [x] 1.2 Add `name` to identity-backed `$account` snapshot in `AttributeService.resolveOriginAccountObjectForVelocity`.

## 2. Update tests

- [x] 2.1 Add `$identity.name` resolves to root identity name test in `attributeService.test.ts`.
- [x] 2.2 Add `$identity.name` overrides `identity.attributes.name` test in `attributeService.test.ts`.
- [x] 2.3 Add `$name` falls back to identity name test in `attributeService.test.ts`.
- [x] 2.4 Add `$name` prefers mapped attribute over identity name test in `attributeService.test.ts`.
- [x] 2.5 Add `$account.name` resolves for identity-backed origin snapshot test in `attributeService.test.ts`.

## 3. Update documentation

- [x] 3.1 Update Velocity context table in `docs/guides/define.md` to mention `$name` and `$identity.name`.
- [x] 3.2 Update Velocity context bullet in `README.md` (source for generated `docs/index.md`) to mention `$name` and `$identity.name`.
- [x] 3.3 Regenerate `docs/index.md` from `README.md` using `node scripts/sync-docs-home.cjs`.

## 4. Verify

- [x] 4.1 Run `attributeService.test.ts`.
- [x] 4.2 Run `tsc --noEmit` and lint on changed files.
- [x] 4.3 Validate the OpenSpec change with `openspec validate promote-identity-name-velocity-context`.
