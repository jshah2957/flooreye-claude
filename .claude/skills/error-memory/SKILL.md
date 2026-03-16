---
name: error-memory
description: Auto-load when any error occurs, fix is attempted, or code change is made during debugging
invocation: auto
---
# Error Memory System

## When an error occurs
Immediately write to .claude/errors.md in this format:

---
[datetime] | Session [N] | Task [N]
FILE: [exact file path]
ERROR: [exact error message]
ROOT CAUSE: [one line explanation]
FIX APPLIED: [what was changed]
FIX STATUS: PENDING | RESOLVED | PARTIAL
RELATED FILES: [other files that touch this code]
---

## When a fix is applied
Update the error entry:
- Change FIX STATUS to RESOLVED or PARTIAL
- Add: VERIFIED: yes/no (did tests pass after fix)
- If PARTIAL: add REMAINING: [what still needs fixing]

## When starting a session
Read .claude/errors.md last 20 lines.
Check for any PENDING or PARTIAL entries.
Report them at session start BEFORE doing anything else.
Format: "⚠ [N] unresolved errors from previous sessions — fix first?"

## Rules
- Never silently ignore an error
- Never apply a fix without logging it
- Never mark RESOLVED without running tests
- If same error appears twice — it means the first fix was wrong — log as RECURRING
