---
name: do-work
description: Complete a single unit of work end-to-end: plan, implement, verify with type check and tests, then commit to a new branch. Use when user says "do work", "implement next phase", "work on the plan", or wants to complete a task from a plan file.
---

# Do Work

Complete one unit of work from start to commit, autonomously.

## Workflow

### 1. Establish the plan

If a plan file is provided or mentioned, read it and identify the next incomplete phase (first phase with unchecked acceptance criteria).

If no plan exists, create one now:
- Explore the codebase to understand current architecture and patterns
- Ask the user to describe the unit of work if unclear
- Invoke `/prd-to-plan` if a PRD is available, otherwise draft a short inline plan covering:
  - What to build (end-to-end behavior)
  - Acceptance criteria (checklist)
- Confirm the plan with the user before proceeding

### 2. Implement

Work through the acceptance criteria top-to-bottom. For each criterion:
- Make the targeted change (prefer editing existing files over creating new ones)
- Mark the criterion complete as you go
- Keep changes minimal — do not refactor or clean up code outside the scope of the criterion

### 3. Verify quality

Run both checks. Fix any errors before proceeding.

```bash
pnpm type-check
pnpm run test
```

If tests fail:
- Read the failure output carefully
- Fix the root cause (do not suppress or skip tests)
- Re-run until clean

### 4. Commit to a new branch

Create a branch and commit:

```bash
# Branch name format: <phase-or-feature-slug>
git checkout -b <descriptive-branch-name>
git add <changed files — never git add -A>
git commit -m "<type>: <concise summary of what was built and why>"
```

Branch naming: use kebab-case, reflect the feature or phase (e.g. `auth-signup-flow`, `revenue-chart-phase-2`).

Commit message format: `<type>: <summary>` where type is `feat`, `fix`, `refactor`, or `test`. Add a body if context is non-obvious.

## Notes

- Do not push to remote unless explicitly asked
- Do not amend existing commits — always create a new one
- If `pnpm type-check` or `pnpm run test` are not available, report this to the user and ask how to proceed
- One branch per unit of work — do not batch unrelated changes
