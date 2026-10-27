---
name: harness-proxy
description: Delegate sub-tasks to isolated AI coding agent harnesses in a single command.
argument-hint: "[--agent <name>] '<prompt>'"
disable-model-invocation: true
---

# harness-proxy

Delegate tasks directly to isolated agent harnesses. The `harness-proxy` CLI autonomously manages git worktree creation, quota balancing, task classification, model selection, live progress streaming to stderr, tier failover, and auto-merging.

## Execution

Your very first tool call in response to this skill MUST be `run_command` executing `harness-proxy run`:

```bash
harness-proxy run [--agent <name>] "<task description with clear acceptance criteria>"
```

### Turn-1 Dispatch Rules

1. **First action is execution**: Issue `harness-proxy run` immediately. Never perform the task interactively in the current conversation. When invoked alongside a workflow command (e.g. `/openspec-apply-change`, `/opsx:apply`, or "apply change <name>"), wrap that workflow as the prompt to `harness-proxy run --agent software-engineer`.
2. **Target scope**: Always scope the prompt to the current workspace repository. Ignore unrelated open editor tabs or historical transcripts.
3. **Pre-dispatch commit**: Worktrees branch from git `HEAD`. Commit any untracked change artifacts or task files on the active branch before running so the worktree inherits them.
4. **Subagent routing cheat-sheet**: Map the user's intent to `--agent <name>` directly:
   - **Code audits, simplification, tech debt, surveys**: `--agent codebase-advisor`
   - **Code review, diff analysis, PR checks**: `--agent code-reviewer`
   - **Feature development, bug fixes, refactoring, change apply**: `--agent software-engineer`
   - **System architecture, schemas, high-level design**: `--agent software-architect`
   - **General tasks or unlisted domains**: omit `--agent` (the router handles it)
5. **Prompt framing**: Expand brief user phrases or workflow commands into clear, goal-driven prompts with concrete deliverables (e.g. `"Apply OpenSpec change openspec/changes/<name> completely: execute tasks.md, pass automated tests, reconcile delta specs, and verify."`).
6. **Result presentation**: Relay the CLI's completed stdout report to the user along with the routing metadata (harness, model, tier) from stderr.
