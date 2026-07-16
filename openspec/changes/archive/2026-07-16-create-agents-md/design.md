## Context

The `.agents/AGENTS.md` file already contains test-running rules and superpowers-bridge workflow routing. It lacks sections covering build/dev commands, project structure, and code conventions — information AI agents need to contribute efficiently without reading `package.json`, `tsconfig.json`, `eslint.config.mjs`, and source files individually.

No architectural changes. Single-file documentation addition.

## Goals / Non-Goals

**Goals:**
- Add build & dev commands section (`npm run build`, `npm test`, `npm run lint`, etc.)
- Add project structure section (`src/` tree with module descriptions)
- Add code conventions section (TypeScript, Prettier, naming, error handling, testing)

**Non-Goals:**
- Modifying existing AGENTS.md content (test rules, workflow routing)
- Creating new config files or changing tool configurations
- Adding CI/CD or automation changes

## Decisions

1. **Append, don't rewrite** — New sections go after existing content. Existing test rules and workflow routing are unchanged. Users and agents reading top-to-bottom see the most actionable content first (workflow routing), then reference material (commands, structure, conventions).

2. **Table format for commands** — Commands table mimics the CLI reference pattern already used in README.md. Consistent with project documentation style.

3. **ASCII tree for structure** — Simple, copy-pasteable tree without dependencies. Preferable to Mermaid diagrams which don't render in all agent contexts.

4. **One spec capability: `agent-onboarding`** — All three sections serve the same purpose (helping agents onboard). Grouped under a single capability rather than three separate specs to avoid over-fragmentation.

## Risks / Trade-offs

- **Staleness**: AGENTS.md may drift from actual conventions → Mitigation: review during PR/onboarding; conventions are stable (TypeScript strict mode, Prettier config)
- **`.agents/` gitignored**: File won't be version-controlled → Mitigation: accepted; this is local agent configuration, not part of the build

## Migration Plan

No migration needed. The file `.agents/AGENTS.md` is gitignored and local-only. Changes take effect immediately for any AI agent reading it.

## Open Questions

None.
