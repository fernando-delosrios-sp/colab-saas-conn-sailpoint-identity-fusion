## 1. Add Build & Dev Commands section

- [x] 1.1 Add commands table to `.agents/AGENTS.md` with `npm run build`, `npm test`, `npm run test:watch`, `npm run test:coverage`, `npm run lint`, `npm run lint:markdown`, `npm run dev`, `npm run docs:serve`, and `npm run prettier`
- [x] 1.2 Include pre-commit guidance to run `npm run lint`

## 2. Add Project Structure section

- [x] 2.1 Add ASCII tree showing `src/` directory layout with descriptions for each module
- [x] 2.2 Document key patterns: `__tests__/` alongside source, barrel exports, config settings file per setting

## 3. Add Code Conventions section

- [x] 3.1 Document TypeScript conventions (strict mode, ES2022 target, ESLint rules, import style, `_` prefix for private members)
- [x] 3.2 Document Prettier formatting (120 width, 4-space tabs, single quotes, no semicolons, trailing commas ES5)
- [x] 3.3 Document naming and structure conventions (camelCase files, PascalCase classes, barrel exports, JSDoc)
- [x] 3.4 Document error handling conventions (ConnectorError, createOperationHandler)
- [x] 3.5 Document testing conventions (Vitest globals, `*.test.ts`, `__tests__/`, 180s timeout)

## 4. Verification

- [x] 4.1 Verify `.agents/AGENTS.md` exists and contains all three new sections
- [x] 4.2 Verify existing content (test rules, workflow routing) is preserved and unchanged
