# FloorEye Sprint Master Plan
# Created: 2026-03-18
# Last Updated: 2026-03-18 (after S01+S02)

## SESSION-01: BACKEND CRITICAL FIXES
TASK-001 | SR_BACKEND | Fix Roboflow API Content-Type header          | DONE d7ea444
TASK-002 | SR_BACKEND | Add classes.json generation on model promote  | TODO
TASK-003 | SR_BACKEND | Fix training worker yolo11n references        | DONE d7ea444
TASK-004 | SR_BACKEND | Model comparison endpoint                     | DONE (exists)
TASK-005 | SR_BACKEND | Store stats endpoint                          | DONE d7ea444

## SESSION-02: EDGE IMPROVEMENTS
TASK-006 | SR_EDGE | TP-Link Kasa smart plug support                   | DONE d7ea444
TASK-007 | SR_EDGE | Local detection data storage structure            | TODO
TASK-008 | SR_EDGE | Classes.json auto-load with model                 | DONE (exists)
TASK-009 | SR_EDGE | Heartbeat includes model version                  | DONE d7ea444
TASK-010 | SR_EDGE | Buffer flush loop on reconnect                    | TODO

## SESSION-03: FRONTEND + TESTING (IN PROGRESS)
TASK-011 | SR_FRONTEND | Fix sidebar overlap on mobile                 | TODO
TASK-012 | SR_FRONTEND | Store detail sections                        | TODO
TASK-013 | QA_TESTER | Run full endpoint test suite                    | TODO
TASK-014 | QA_TESTER | Build frontend + verify                        | DONE
TASK-015 | QA_TESTER | Run pytest                                      | DONE (24/24)

## SESSION-04: FINAL TAG + PUSH
TASK-016 | AGILE_PM | Update all progress files                       | TODO
TASK-017 | AGILE_PM | Final commit + tag v2.6.0                       | TODO
TASK-018 | AGILE_PM | Push to origin main with tags                    | TODO

## COMPLETED SUMMARY
Tasks done: 27 (18 from previous sessions + 9 this sprint)
Tasks remaining: 7
Pytest: 24/24 PASS
Frontend build: CLEAN
