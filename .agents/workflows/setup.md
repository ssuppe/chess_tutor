---
description: Initialize project structure and documentation
---

# Initialize project structure and documentation

You are a project initialization specialist. Your task is to set up a standardized documentation structure for this repository and establish the development process.

### Phase 1: Scaffolding
1. Create the following directory structure if it doesn't exist:
   - `docs/pm` (Product requirements, PRDs, user stories)
   - `docs/design` (UX concepts, wireframes, interaction flows)
   - `docs/eng` (Technical designs, architecture, development process)

2. Create `docs/eng/DEVELOPMENT_PROCESS.md` by using the template provided below. **Generalization Rule:** Replace any references to "Goodnumbers" with the name of the current project directory (capitalized).

### Phase 2: Documentation Audit
1. **Privacy Rule:** If this is a public repository (check `.git/config` or ask the user), **DO NOT** modify the root `README.md`. We want to keep our internal tools and folder structures out of the public-facing documentation.
2. Only if the repository is private or the user explicitly requests it: Check for a `README.md` in the root. If it's missing or nearly empty, generate a basic structure that points to the new `docs/` folders.
3. If there is a `DEVELOPMENT_PROCESS.md` in the root, remove it after successfully creating the one in `docs/eng/`.

### Phase 3: Discovery Loop
Once the files are created, ask the user:
"I have initialized the standard documentation structure and established the development process in `docs/eng/DEVELOPMENT_PROCESS.md`. 

Do you have any existing PRDs, technical notes, or specific project constraints you'd like me to import, summarize, or organize into these folders now?"

---
### DEVELOPMENT_PROCESS.MD TEMPLATE
# {{PROJECT_NAME}} Development Process

**Version:** 2.0
**Date:** {{CURRENT_DATE}}

## 1. Overview
This document outlines the standardized Git workflow and development process. Adhering to this process ensures a stable codebase, a clean and understandable version history, and a predictable, quality-driven development cycle. The core of our strategy is a **Feature Branch Workflow** with **Conventional Commits**, targeting a central `develop` integration branch.

## 2. Branching Strategy
### 2.1. Core Branches
- **`main`:** Official, production-ready release history. Direct commits are forbidden.
- **`develop`:** Primary integration branch for day-to-day development. Must always compile and pass tests.

### 2.2. Feature Branches
All new work must be done on a dedicated feature branch created from `develop`.
- **Naming Convention:** `type/short-description` (e.g., `feat/auth-logic`, `fix/header-styling`).

## 3. Commit Strategy: Conventional Commits
Format: `<type>(<scope>): <subject>`
Types: `feat`, `fix`, `test`, `refactor`, `docs`, `style`, `chore`.
Subject: Always start with "Phase #, Task #:".

## 4. The Pull Request (PR) Process
1. **Branch:** Create feature branch from latest `develop`.
2. **Work & Commit:** Discrete tasks only. TDD (Tests first). Small, logical commits.
3. **Push:** Push to remote.
4. **Open PR:** Target `develop`. Include summary, task links, and "How to Test" instructions.

### 4.1. Automated Quality Gates
Before pushing, run:
1. **Linting:** `npm run lint` (or project equivalent).
2. **Type Checking:** `tsc` or equivalent.
3. **Tests:** Use AI-optimized test commands if available (low verbosity, bail on first failure).

### 4.2. Review and Merge
- Requires approval from a teammate/lead.
- Use **"Squash and Merge"**.
- Delete feature branch after merge.

## 5. Security Checks
1. **Dependency Audit:** Check for high/critical vulnerabilities before merging.
2. **Secrets:** Never commit API keys or secrets. Use `.env` files.
---
