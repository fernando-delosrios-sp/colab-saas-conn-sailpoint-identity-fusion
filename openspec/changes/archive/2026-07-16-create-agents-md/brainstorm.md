<!--
Raw capture of superpowers:brainstorming output.

本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

# Brainstorm: create-agents-md

## Background
Project: Identity Fusion NG — SailPoint ISC connector (TypeScript, Node.js, npm).
An existing `.agents/AGENTS.md` already exists with:
- Test running rules (no piping to tail)
- Superpowers-bridge workflow routing
- Entry routing table, skip rules, promotion criteria, anti-patterns

Goal: Expand `.agents/AGENTS.md` to include build/dev commands, project structure, and code conventions.

## Q1: What should the AGENTS.md cover?
**Answer:** Expand existing `.agents/AGENTS.md`

## Q2: What sections to add?
**Answer:** All of the above — build & dev commands, project structure guide, code conventions

## Q3: Approach confirmation
**Answer:** Looks good, proceed — with clarification that `_` prefix is for private members (not ESLint)

## Q4: `_` prefix convention
**Answer:** Just private (not for ESLint)

## Design — Section 1: Build & Dev Commands
Approved ✓

## Design — Section 2: Project Structure
Approved ✓

## Design — Section 3: Code Conventions
Approved ✓
