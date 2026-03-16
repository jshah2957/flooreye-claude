---
name: fix-discipline
description: Auto-load when fixing bugs or errors to ensure fixes are complete and verified
invocation: auto
---
# Fix Discipline Rules

## Before applying any fix
1. Read .claude/errors.md — check if this error appeared before
2. If it appeared before and was "fixed" — the previous fix was wrong
   Log as RECURRING and find the real root cause
3. Identify ALL files affected by this fix — not just the one with the error
4. Write the fix plan to .claude/errors.md before touching any code

## Fix plan format
FIX PLAN:
- Root cause: [one sentence]
- Files to change: [list]
- Files to verify after: [list]
- Test to run: [exact pytest command or manual check]

## After applying fix
1. Run tests immediately: python -m pytest tests/ -v --tb=short
2. If tests pass: mark RESOLVED in errors.md
3. If tests fail: mark PARTIAL, log what still fails
4. Commit fix with message: "Fix: [error description] — Session [N]"
5. Never move to next task with PENDING fixes unless explicitly told to skip

## Recurring error rule
If same error appears 3 times:
STOP all work.
Write to .claude/errors.md: CRITICAL RECURRING ERROR
Report to user: "This error has occurred [N] times.
Previous fixes: [list].
Recommend: review [file] architecture before continuing."
Wait for instruction before proceeding.
