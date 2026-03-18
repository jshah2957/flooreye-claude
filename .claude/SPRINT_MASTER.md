# FloorEye Sprint Master Plan
# Created: 2026-03-18
# Last Updated: 2026-03-18

## SESSION-01: BACKEND CRITICAL FIXES
TASK-001 | SR_BACKEND | Fix Roboflow API Content-Type header          | TODO
TASK-002 | SR_BACKEND | Add classes.json generation on model promote  | TODO
TASK-003 | SR_BACKEND | Fix training worker to use yolo11n            | TODO
TASK-004 | SR_BACKEND | Add model comparison endpoint                 | DONE (exists)
TASK-005 | SR_BACKEND | Fix store detail API (cameras, incidents)     | TODO

## SESSION-02: EDGE IMPROVEMENTS
TASK-006 | SR_EDGE | Add TP-Link Kasa smart plug support              | TODO
TASK-007 | SR_EDGE | Local detection data storage structure           | TODO
TASK-008 | SR_EDGE | Classes.json auto-load with model                | DONE (exists)
TASK-009 | SR_EDGE | Edge heartbeat includes model version            | TODO
TASK-010 | SR_EDGE | Buffer flush loop (auto-sync on reconnect)       | TODO

## SESSION-03: FRONTEND FIXES
TASK-011 | SR_FRONTEND | Fix sidebar on mobile (no overlap)           | TODO
TASK-012 | SR_FRONTEND | Store detail sections complete               | TODO
TASK-013 | SR_FRONTEND | Detection review page with batch ops         | TODO
TASK-014 | SR_FRONTEND | Model management page improvements          | TODO
TASK-015 | SR_FRONTEND | Notification settings page                   | TODO

## SESSION-04: TESTING + VERIFICATION
TASK-016 | QA_TESTER | Run full pytest suite                         | TODO
TASK-017 | QA_TESTER | Test all 21+ API endpoints                    | TODO
TASK-018 | QA_TESTER | Test user flows (store manager, admin)        | TODO
TASK-019 | QA_TESTER | Build frontend and verify                     | TODO
TASK-020 | QA_TESTER | Final commit and tag                          | TODO

## PREVIOUSLY COMPLETED
TASK-P01 | Edge validator Layer 4 duplicate suppression    | DONE v2.5.4
TASK-P02 | DeviceController wired into main loop          | DONE v2.5.4
TASK-P03 | push_config applies settings dynamically       | DONE v2.5.4
TASK-P04 | Upload logic uses validator result             | DONE v2.5.5
TASK-P05 | Non-blocking live frame capture                | DONE v2.5.5
TASK-P06 | Edge frames upload to S3 not MongoDB           | DONE v2.5.1
TASK-P07 | WebSocket broadcast from edge endpoints        | DONE v2.5.1
TASK-P08 | S3 client connection pooling                   | DONE v2.5.1
TASK-P09 | Non-blocking S3 upload                         | DONE v2.5.1
TASK-P10 | Graceful notifications without SMTP            | DONE v2.5.1
TASK-P11 | Datetime timezone fix                          | DONE v2.5.2
TASK-P12 | Health check validates services                | DONE v2.5.0
TASK-P13 | Production startup blocks default secrets      | DONE v2.5.0
TASK-P14 | MinIO running + bucket created                 | DONE v2.5.2
TASK-P15 | Store manager simplified sidebar               | DONE v2.5.1
TASK-P16 | Camera names instead of UUIDs                  | DONE v2.5.1
TASK-P17 | Roboflow class sync endpoint                   | DONE dd4c33c
TASK-P18 | Fix yolo26n → yolo11n defaults                 | DONE dd4c33c
