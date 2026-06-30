# AI Agent Rules

## Running Tests
NEVER run `npm test 2>&1 | tail -40` or pipe `npm test` / `jest` output directly to `tail`. 
Piping to `tail` buffers the entire output until EOF. This means AI agents will not receive any incremental log output, and if the tests hang (e.g., due to open handles), the agent will sit indefinitely without receiving any error or timeout clues. 

**What to do instead:**
- Run the test directly: `npm test` (if output is short enough).
- If the output is extremely long, redirect output to a file and read it later: `npm test > test-output.log 2>&1`, then view `test-output.log`.
- Run specific test files instead of the entire suite to keep output short and relevant.
