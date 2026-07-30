# Retrospective — wire-localization-config

## What went well

- Code review findings mapped cleanly to a focused resolver + wiring change without new services.
- TDD on `localization.test.ts` caught attribute precedence early.
- Dictionary parity test prevents silent English fallback regressions.

## Misses / follow-ups

- ISC review form UI labels (`FormService` / `formBuilder.ts`) remain English — tracked as deferred in design and docs.
- Dry-run email recipients are address-only; locale uses `defaultLanguage` / config fallback rather than identity lookup.

## Process notes

- `reportService.ts` required scripted patches when native edit tools failed on the large file; worth watching for editor/map-mode issues.
