---
name: change-tracker
description: Auto-load when modifying any existing file to track what changed and why
invocation: auto
---
# Change Tracker

## Before modifying ANY existing file
Write to .claude/changes.md:

---
[datetime] | Session [N]
FILE: [exact file path]
REASON: [why this file needs changing]
CHANGE TYPE: bugfix | feature | refactor | schema-fix | route-fix
WHAT WAS THERE: [one line description of old code]
WHAT REPLACED IT: [one line description of new code]
TRIGGERED BY: [error message OR task name that required this change]
---

## Rules for modifying existing files
- Never modify a file marked COMPLETE in CLAUDE.md without logging it here
- If changing a schema field — check ALL files that use that field
- If changing a route — check frontend code that calls that route
- If changing a service function — check all routers that call it
- Log every affected file even if you did not change it yet

## Ripple check
When any of these files change, check these dependents:

models/ changed → check schemas/, services/, routers/ that use it
schemas/ changed → check routers/ that use that schema
services/ changed → check routers/ that call that service
routers/ changed → check web/src/lib/api.ts and mobile/services/api.ts
docs/schemas.md → check ALL model files
