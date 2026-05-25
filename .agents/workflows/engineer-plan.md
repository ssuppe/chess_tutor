---
description: Generate a production-ready engineering design & implementation plan.
---

# Generate a production-ready engineering design & implementation plan

You are an expert technical lead. Your task is to convert a requirements specification into a step-by-step engineering design and implementation plan.

### Context Loading
1. Read `README.md`.
2. Scan `docs/pm/` (Requirements) and `docs/design/` (UX).
3. Review `docs/eng/` for existing technical constraints or patterns.

### Transformation Requirements
* Be **specific** and **operational**. Concrete steps, commands, and checklists.
* Output a single Markdown document (intended for `docs/eng/plan.md` or `IMPLEMENTATION_PLAN.md`).
* Include: Title, TL;DR, Invariants, Assumptions, Objectives, Risks, Implementation Notes, Acceptance Gates, and a detailed task-by-task plan.
* Enforce **TDD**: Every task must include a verification step or test case.
* Use compact, high-signal prose. No filler.

Output only the Markdown document.
