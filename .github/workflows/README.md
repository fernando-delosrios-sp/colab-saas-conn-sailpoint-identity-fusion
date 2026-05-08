# AI Review Workflows

This directory contains AI-powered pull request review workflows using Cursor and OpenCode agents.

## Quick Reference

| Workflow                             | Description                                                      | Trigger                                |
| ------------------------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| `new-version-full-review.yml`        | Main orchestrator: runs all quality checks + AI OpenCode reviews | PR opened/synced on `main`             |
| `ai-opencode-review.yml`             | Wrapper: runs all 4 OpenCode reviews in parallel                 | `workflow_call` or `workflow_dispatch` |
| `ai-cursor-review.yml`               | Wrapper: runs all 4 Cursor reviews in parallel                   | `workflow_call` or `workflow_dispatch` |
| `ai-docs-review-cursor.yml`          | Docs review using Cursor CLI                                     | `workflow_call` or `workflow_dispatch` |
| `ai-docs-review-opencode.yml`        | Docs review using OpenCode CLI                                   | `workflow_call` or `workflow_dispatch` |
| `ai-performance-review-cursor.yml`   | Performance review using Cursor CLI                              | `workflow_call` or `workflow_dispatch` |
| `ai-performance-review-opencode.yml` | Performance review using OpenCode CLI                            | `workflow_call` or `workflow_dispatch` |
| `ai-security-review-cursor.yml`      | Security review using Cursor CLI                                 | `workflow_call` or `workflow_dispatch` |
| `ai-security-review-opencode.yml`    | Security review using OpenCode CLI                               | `workflow_call` or `workflow_dispatch` |
| `ai-refactor-review-cursor.yml`      | Refactor review using Cursor CLI                                 | `workflow_call` or `workflow_dispatch` |
| `ai-refactor-review-opencode.yml`    | Refactor review using OpenCode CLI                               | `workflow_call` or `workflow_dispatch` |

## How to Trigger

### Run all OpenCode AI reviews (automatic)

Open a PR against `main` -- `new-version-full-review.yml` runs automatically.

### Run all OpenCode AI reviews (manual)

Go to **Actions** > **New version full review** > **Run workflow**.

### Run a single OpenCode review (manual)

Go to the individual workflow file (e.g. `ai-docs-review-opencode.yml`) > **Run workflow**.

### Run all Cursor reviews (manual)

Go to **Actions** > **AI Cursor review** > **Run workflow**.

### Run a single Cursor review (manual)

Go to the individual workflow file (e.g. `ai-docs-review-cursor.yml`) > **Run workflow**.

## Required Secrets

| Secret             | Used by                        |
| ------------------ | ------------------------------ |
| `CURSOR_API_KEY`   | All `*-cursor.yml` workflows   |
| `OPENCODE_API_KEY` | All `*-opencode.yml` workflows |

Add these in **Settings > Secrets and variables > Actions**.

## Workflows Directory

- `.github/workflows/ai-*-cursor.yml` -- Cursor-based agents
- `.github/workflows/ai-*-opencode.yml` -- OpenCode-based agents
- `.github/workflows/ai-cursor-review.yml` -- Cursor wrapper
- `.github/workflows/ai-opencode-review.yml` -- OpenCode wrapper
- `.github/workflows/new-version-full-review.yml` -- Main orchestrator
- `.github/workflows/yaml-lint.yml` -- YAML syntax validation
