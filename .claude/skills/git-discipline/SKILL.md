---
name: git-discipline
description: Git commit and push rules - load when making any git operations
---
# Git Discipline Rules

## Commit Message Format
Always use exactly this format:
Session [N] | Task [N]: [description of what was built]

Examples:
Session 8 | Task 1: Store Pydantic model
Session 8 | Task 3: Store CRUD router 5 endpoints
Session 9 | Task 2: Camera service with ROI support

## Push Rules
- Push to origin/main after every 3 commits minimum
- Always push at end of session using /session-end
- Never force push
- Never push broken or untested code

## What to commit together
- One task = one commit
- Never bundle multiple unrelated tasks in one commit
- Always include updated CLAUDE.md and PROGRESS.md in session-end commit
