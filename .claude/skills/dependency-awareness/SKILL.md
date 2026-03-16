---
name: dependency-awareness
description: Auto-load when writing or modifying any Python or TypeScript file to track cross-file dependencies
invocation: auto
---
# Dependency Awareness

## FloorEye dependency map
When changing files in these layers, always check downstream:

LAYER 1 — Data Models (models/)
Used by: schemas/, services/, workers/, tests/
If you change a model field: search all of schemas/ services/ workers/ for that field name

LAYER 2 — Schemas (schemas/)
Used by: routers/, tests/
If you change a request or response schema: check all routers that use it

LAYER 3 — Services (services/)
Used by: routers/, workers/, tests/
If you change a service function signature: check all callers

LAYER 4 — Routers (routers/)
Used by: web/src/lib/api.ts, mobile/services/api.ts
If you change a route path or method: update frontend API calls

LAYER 5 — Frontend API (web/src/lib/api.ts)
Used by: all web pages and hooks
If you change an API function: check all useQuery and useMutation calls

LAYER 6 — Mobile API (mobile/services/api.ts)
Used by: all mobile screens and hooks

## Before touching any file
Run this mental check:
"If I change [file], what breaks downstream?"
Log the answer in .claude/changes.md before starting.

## Search commands to find dependents
To find all files using a function or field name:
grep -r "field_name" backend/app/ --include="*.py"
grep -r "functionName" web/src/ --include="*.ts" --include="*.tsx"
