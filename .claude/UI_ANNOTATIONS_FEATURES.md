# FloorEye Phase 2 — UI, Annotations & Missing Features
# Created: 2026-03-18
# Base: v2.7.1

## HOW TO RESUME AFTER RESTART
1. Read this file first
2. Find first SESSION marked IN_PROGRESS or TODO
3. Find first TASK marked TODO in that session
4. Continue from that exact task
5. Never redo DONE tasks
6. Commit after every single task

## CURRENT STATUS
- Current Session: AUDIT
- Current Task: Audit agents launching
- Last Commit: c8907e2 (v2.7.1)

## AUDIT PHASE | STATUS: IN_PROGRESS
TASK-201 | SR_UI_TESTER    | Audit every cloud app page           | TODO
TASK-202 | SR_EDGE_AUDITOR | Audit edge annotation + storage      | TODO
TASK-203 | SR_ARCHITECT    | Gap analysis vs SRD + v2.7.1         | TODO
TASK-204 | AGILE_PM        | Create master issues list             | TODO

## SESSION-17: EDGE ANNOTATIONS + LOCAL STORAGE | STATUS: TODO
TASK-205 | SR_EDGE | Implement OpenCV annotation drawing on frames  | TODO
TASK-206 | SR_EDGE | Save annotated + clean frame versions locally  | TODO
TASK-207 | SR_EDGE | Local folder structure with proper naming      | TODO
TASK-208 | SR_EDGE | Upload both versions to MinIO                  | TODO
TASK-209 | SR_EDGE | Add timestamp + store + camera text on frame   | TODO
TASK-210 | SR_EDGE | Wire into detection loop (after validator)     | TODO
TASK-211 | SR_CODE_REVIEWER | Review Session-17 changes            | TODO
TASK-212 | SR_CODE_REVIEWER | Run pytest + endpoint tests          | TODO

## SESSION-18: CLOUD APP FIXES | STATUS: TODO
TASK-213 | SR_FRONTEND | Fix sidebar mobile responsive collapse    | TODO
TASK-214 | SR_FRONTEND | Store overview section with real data      | TODO
TASK-215 | SR_FRONTEND | Store cameras section with thumbnails     | TODO
TASK-216 | SR_FRONTEND | Store incidents section with filters      | TODO
TASK-217 | SR_FRONTEND | Store edge agent section with commands    | TODO
TASK-218 | SR_FRONTEND | Detection review with annotated/clean toggle | TODO
TASK-219 | SR_CODE_REVIEWER | Review Session-18 changes            | TODO
TASK-220 | SR_CODE_REVIEWER | Build frontend + verify              | TODO

## SESSION-19: REMAINING FEATURES | STATUS: TODO
TASK-221 | SR_BACKEND  | Detection annotated/clean frame URLs in API | TODO
TASK-222 | SR_BACKEND  | Store stats API improvements               | TODO
TASK-223 | SR_FRONTEND | Analytics dashboard charts                 | TODO
TASK-224 | SR_FRONTEND | Notification settings page                 | TODO
TASK-225 | SR_FRONTEND | Model management improvements              | TODO
TASK-226 | SR_FRONTEND | Camera floor boundary editor               | TODO
TASK-227 | SR_CODE_REVIEWER | Review Session-19 changes             | TODO
TASK-228 | SR_CODE_REVIEWER | Full system test                      | TODO

## SESSION-20: TESTING + FINAL | STATUS: TODO
TASK-229 | SR_UI_TESTER  | Test every page end to end               | TODO
TASK-230 | ADMIN_AGENT   | Test admin functions                     | TODO
TASK-231 | END_USER_1    | Test store manager flow                  | TODO
TASK-232 | END_USER_2    | Test technician + edge flow              | TODO
TASK-233 | SR_ARCHITECT  | Final architecture sign-off              | TODO
TASK-234 | AGILE_PM      | Phase 2 final report                     | TODO
TASK-235 | AGILE_PM      | Commit + tag + push                      | TODO
