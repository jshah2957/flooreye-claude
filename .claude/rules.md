# FloorEye Global Rules
# These rules override ALL other instructions. No exceptions.
# Created: 2026-03-19

## RULE 1 — ARCHITECT APPROVAL REQUIRED FOR ALL CHANGES
No code change, file deletion, document update, or architectural decision
may be implemented without explicit ARCHITECT approval.

Process:
1. ENGINEER researches and proposes a change
2. Proposal written to ARCHITECT_PENDING.md with evidence
3. ARCHITECT reviews and writes APPROVED or REJECTED in ARCHITECT_REVIEW.md
4. Only after APPROVED appears may the change be implemented
5. If ARCHITECT writes NEEDS_MORE_RESEARCH, do more research and resubmit
6. Do more research until ARCHITECT approves. Never stop researching.

Self-approval is forbidden:
- Writing a decision and executing it in the same session = self-approval
- Playing ARCHITECT and ENGINEER in the same action = self-approval
- Silence is not approval. Absence of rejection is not approval.

## RULE 2 — docs/SRD.md IS READ-ONLY
No agent may write to docs/SRD.md under any circumstance.
If SRD needs updating, write proposed change to SRD_CHANGE_REQUEST.md.
Wait for human approval before touching SRD.

## RULE 3 — NO PREMATURE TAGGING
No git tag may be created until GM_STATE.md contains
a signed sign-off entry from every agent involved.
Every agent must show evidence, not self-certification.

## RULE 4 — NO FILE DELETIONS WITHOUT EXPLICIT APPROVAL
Before every commit run: git diff --cached --name-only --diff-filter=D
If any file is being deleted, STOP.
Write the filename to GM_STATE.md with status BLOCKED.
Do not proceed until explicitly instructed by human.

## RULE 5 — NO SCOPE CREEP
Each session has a defined scope in PM_PLAN.md.
If a task is not in PM_PLAN.md for this session, it cannot be done.
Add it to the next session plan instead.

## RULE 6 — RESEARCH UNTIL APPROVED
If ARCHITECT has not approved, do more research.
Never assume approval. Never skip the approval step.
Keep researching, investigating, and gathering evidence
until ARCHITECT explicitly writes APPROVED.

## RULE 7 — SOURCE OF TRUTH HIERARCHY
1. docs/SRD.md (read-only master spec)
2. ARCHITECT_REVIEW.md (approved decisions)
3. docs/schemas.md, docs/api.md (field names, routes)
4. Code (implements the above, never overrides them)

Documents lower in the hierarchy must conform to documents
higher in the hierarchy. Code adapts to spec, not reverse.

## RULE 8 — DO NOT CHANGE WORKING CODE WITHOUT REASON
If code is working correctly and passing tests, do not modify it
unless there is a documented bug, security vulnerability, or
approved feature request. "Cleanup" and "standardization" are
not valid reasons to change working code.
