## Why

The `.agents/AGENTS.md` file existed but was missing essential information that AI agents need to work effectively on this project — build commands, project structure, and code conventions. Without these, agents must discover them by reading `package.json`, `tsconfig.json`, `eslint.config.mjs`, and source files individually, which is inefficient and error-prone.

## What Changes

- Add **Build & Dev Commands** section with `npm run build`, `npm test`, `npm run lint`, `npm run dev`, `npm run docs:serve`, and `npm run prettier` commands
- Add **Project Structure** section with `src/` directory tree and descriptions of each module (data, model, operations, services, utils)
- Add **Code Conventions** section covering TypeScript strict mode, ESLint rules, Prettier config, naming patterns, error handling, and testing conventions

## Capabilities

### New Capabilities
- `agent-onboarding`: Provide AI agents with the build commands, project structure, and code conventions needed to contribute to this project effectively

### Modified Capabilities
<!-- No existing capabilities modified -->

## Impact

- Affected file: `.agents/AGENTS.md` (additions only, no existing content changed)
- No code, API, dependency, or system changes
