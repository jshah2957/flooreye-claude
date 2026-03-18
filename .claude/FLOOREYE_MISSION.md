# FloorEye Mission Control
# Created: 2026-03-18
# Total Sessions: 16 | Total Tasks: 128

## HOW TO RESUME AFTER RESTART
1. Read this file first
2. Find first SESSION marked IN_PROGRESS or TODO
3. Inside that session find first TASK marked TODO
4. Continue from that exact task
5. Never redo DONE tasks
6. Commit after every single task

## CURRENT STATUS
- Current Session: SESSION-07
- Current Task: TASK-049
- Last Commit: c6271af
- Next Action: Create this file + commit

## SESSION-01: FOUNDATION | STATUS: DONE
TASK-001 | AGILE_PM       | Create FLOOREYE_MISSION.md           | DONE
TASK-002 | SR_ARCHITECT   | Architecture summary + API approval  | DONE
TASK-003 | SR_RESEARCHER  | TP-Link Kasa API research            | DONE
TASK-004 | SR_RESEARCHER  | Roboflow class sync + model API      | DONE
TASK-005 | SR_RESEARCHER  | WebSocket streaming via CF Tunnel     | DONE
TASK-006 | USE_CASE       | Edge app use cases                   | DONE
TASK-007 | USE_CASE       | Cloud app use cases                  | DONE
TASK-008 | USE_CASE       | Mobile app use cases                 | DONE

## SESSION-02: DATABASE + DATA ORG | STATUS: DONE
TASK-009  | SR_DATABASE | Fix MongoDB schemas                    | DONE (verified)
TASK-010  | SR_DATABASE | Fix file naming convention             | DONE (verified)
TASK-011  | SR_DATABASE | Fix MinIO storage paths                | DONE (verified)
TASK-012  | SR_DATABASE | Fix indexes on all collections         | DONE (verified)
TASK-013  | SR_DATABASE | Fix sync_queue for offline buffering   | DONE (verified)
TASK-014  | SR_DATABASE | Fix TTL indexes for cleanup            | DONE (verified)
TASK-015  | SR_DATABASE | Verify schemas match SRD.md            | DONE (verified)
TASK-016  | SR_CODE_REVIEWER | Review Session-02                 | DONE

## SESSION-03: EDGE CAMERAS + DETECTION | STATUS: DONE
TASK-017 | SR_EDGE | Multiple camera add/remove/edit             | DONE (verified)
TASK-018 | SR_EDGE | Camera health monitoring + reconnect        | DONE (verified)
TASK-019 | SR_EDGE | Camera list sync with cloud                 | DONE (verified)
TASK-020 | SR_EDGE | Verify ONNX runs locally only               | DONE (verified)
TASK-021 | SR_EDGE | Real-time annotation (boxes + labels)       | DONE (verified)
TASK-022 | SR_EDGE | Classes from classes.json                   | DONE (verified)
TASK-023 | SR_EDGE | Detection speed optimization <100ms         | DONE (verified)
TASK-024 | SR_CODE_REVIEWER | Review Session-03                  | DONE (verified)

## SESSION-04: EDGE STORAGE + IOT | STATUS: DONE
TASK-025 | SR_EDGE | Local storage structure                     | DONE (verified)
TASK-026 | SR_EDGE | Frame naming convention                     | DONE (verified)
TASK-027 | SR_EDGE | Clip naming convention                      | DONE (verified)
TASK-028 | SR_EDGE | Log naming convention                       | DONE (verified)
TASK-029 | SR_EDGE | TP-Link Kasa device discovery               | DONE (verified)
TASK-030 | SR_EDGE | TP-Link auto ON on confirmed detection      | DONE (verified)
TASK-031 | SR_EDGE | TP-Link auto OFF after timer                | DONE (verified)
TASK-032 | SR_CODE_REVIEWER | Review Session-04                  | DONE (verified)

## SESSION-05: EDGE SYNC + STREAMING | STATUS: DONE
TASK-033 | SR_EDGE | Send detections to cloud instantly          | DONE
TASK-034 | SR_EDGE | Send frames+clips to MinIO                 | DONE
TASK-035 | SR_EDGE | Offline buffer + auto-sync                 | DONE
TASK-036 | SR_EDGE | Live stream with overlay via WebSocket      | DONE
TASK-037 | SR_EDGE | Receive floor boundary from cloud           | DONE
TASK-038 | SR_EDGE | Receive dry floor reference from cloud      | DONE
TASK-039 | SR_EDGE | Email notifications with attachment         | DONE
TASK-040 | SR_CODE_REVIEWER | Review Session-05                  | DONE

## SESSION-06: CLOUD BACKEND CORE | STATUS: DONE
TASK-041 | SR_BACKEND | Fix sidebar overlap                     | DONE
TASK-042 | SR_BACKEND | Fix yolo26n → yolo11n                   | DONE (dd4c33c)
TASK-043 | SR_BACKEND | Roboflow class sync API                 | DONE (dd4c33c)
TASK-044 | SR_BACKEND | Classes.json bundled with model deploy   | DONE
TASK-045 | SR_BACKEND | Live feed API from edge camera           | DONE
TASK-046 | SR_BACKEND | Frame extraction API                    | DONE
TASK-047 | SR_BACKEND | Clip recording API                      | DONE
TASK-048 | SR_CODE_REVIEWER | Review Session-06                  | DONE

## SESSION-07: CLOUD MODEL PIPELINE | STATUS: DONE
TASK-049 | SR_BACKEND | Upload ONNX to registry                 | TODO
TASK-050 | SR_BACKEND | Download from Roboflow to cloud          | TODO
TASK-051 | SR_BACKEND | Push model cloud → edge                  | TODO
TASK-052 | SR_BACKEND | Model version history                   | TODO
TASK-053 | SR_BACKEND | Model comparison API                    | TODO
TASK-054 | SR_BACKEND | Model rollback                          | TODO
TASK-055 | SR_BACKEND | Accuracy test mode                      | TODO
TASK-056 | SR_CODE_REVIEWER | Review Session-07                  | TODO

## SESSION-08: RULES + STORE SECTIONS | STATUS: TODO
TASK-057 | SR_BACKEND | Detection rules engine CRUD             | TODO
TASK-058 | SR_BACKEND | Rule: wet+sign→suppress                 | TODO
TASK-059 | SR_BACKEND | Rule: dried→auto OFF                    | TODO
TASK-060 | SR_BACKEND | Rule: maintenance window                | TODO
TASK-061 | SR_BACKEND | Store Overview API                      | TODO
TASK-062 | SR_BACKEND | Store Cameras API                       | TODO
TASK-063 | SR_BACKEND | Store Incidents API                     | TODO
TASK-064 | SR_CODE_REVIEWER | Review Session-08                  | TODO

## SESSION-09: REMAINING STORE SECTIONS | STATUS: TODO
TASK-065 | SR_BACKEND | Store Edge Agent API                    | TODO
TASK-066 | SR_BACKEND | Store Detection API                     | TODO
TASK-067 | SR_BACKEND | Store Overrides API                     | TODO
TASK-068 | SR_BACKEND | Store Audit Log API                     | TODO
TASK-069 | SR_BACKEND | Video upload + extraction API           | TODO
TASK-070 | SR_BACKEND | Image upload API                        | TODO
TASK-071 | SR_BACKEND | Model test on upload API                | TODO
TASK-072 | SR_CODE_REVIEWER | Review Session-09                  | TODO

## SESSION-10: REVIEW + ANALYTICS | STATUS: TODO
TASK-073 | SR_BACKEND | Detection Review API                    | TODO
TASK-074 | SR_BACKEND | Review queue                            | TODO
TASK-075 | SR_BACKEND | Upload to Roboflow dataset              | TODO
TASK-076 | SR_BACKEND | Analytics API                           | TODO
TASK-077 | SR_BACKEND | Notification settings API               | TODO
TASK-078 | SR_BACKEND | Training pipeline Celery+GPU            | TODO
TASK-079 | SR_BACKEND | Floor boundary push API                 | TODO
TASK-080 | SR_CODE_REVIEWER | Review Session-10                  | TODO

## SESSION-11: FRONTEND STORE SECTIONS | STATUS: TODO
TASK-081 | SR_FRONTEND | Fix sidebar overlap CSS                | DONE
TASK-082 | SR_FRONTEND | Store Overview page                    | DONE
TASK-083 | SR_FRONTEND | Store Cameras page                     | DONE
TASK-084 | SR_FRONTEND | Store Incidents page                   | DONE
TASK-085 | SR_FRONTEND | Store Edge Agent page                  | DONE
TASK-086 | SR_FRONTEND | Store Detection page                   | DONE
TASK-087 | SR_FRONTEND | Store Overrides page                   | DONE
TASK-088 | SR_CODE_REVIEWER | Review Session-11                  | DONE

## SESSION-12: FRONTEND MODEL+RULES+UPLOAD | STATUS: TODO
TASK-089 | SR_FRONTEND | Store Audit Log page                   | TODO
TASK-090 | SR_FRONTEND | Model Management page                  | TODO
TASK-091 | SR_FRONTEND | Model comparison UI                    | TODO
TASK-092 | SR_FRONTEND | Detection Rules UI                     | TODO
TASK-093 | SR_FRONTEND | Video+image upload section              | TODO
TASK-094 | SR_FRONTEND | Model test on upload UI                | TODO
TASK-095 | SR_FRONTEND | Upload to Roboflow button              | TODO
TASK-096 | SR_CODE_REVIEWER | Review Session-12                  | TODO

## SESSION-13: FRONTEND REVIEW+ANALYTICS | STATUS: TODO
TASK-097 | SR_FRONTEND | Detection Review page                  | TODO
TASK-098 | SR_FRONTEND | Camera boundary editor                 | TODO
TASK-099 | SR_FRONTEND | Live feed multi-camera grid            | TODO
TASK-100 | SR_FRONTEND | Analytics dashboard                   | TODO
TASK-101 | SR_FRONTEND | Notification settings page             | TODO
TASK-102 | SR_FRONTEND | Self-training dashboard                | TODO
TASK-103 | SR_FRONTEND | Roboflow classes in all UIs            | TODO
TASK-104 | SR_CODE_REVIEWER | Review Session-13                  | TODO

## SESSION-14: MOBILE APP | STATUS: TODO
TASK-105 | SR_FRONTEND | Mobile analytics                      | TODO
TASK-106 | SR_FRONTEND | Mobile live feeds                     | TODO
TASK-107 | SR_FRONTEND | Mobile IoT status                     | TODO
TASK-108 | SR_FRONTEND | Mobile camera status                  | TODO
TASK-109 | SR_FRONTEND | Mobile detection results              | TODO
TASK-110 | SR_FRONTEND | Mobile push notifications             | TODO
TASK-111 | SR_BACKEND  | Verify mobile API endpoints           | TODO
TASK-112 | SR_CODE_REVIEWER | Review Session-14                  | TODO

## SESSION-15: FULL TESTING | STATUS: TODO
TASK-113 | SR_UI_TESTER  | Test every cloud app page            | TODO
TASK-114 | SR_UI_TESTER  | Test sidebar on all screen sizes     | TODO
TASK-115 | ADMIN_AGENT   | Test model management                | TODO
TASK-116 | ADMIN_AGENT   | Test detection rules                 | TODO
TASK-117 | ADMIN_AGENT   | Test camera boundary editor          | TODO
TASK-118 | END_USER_1    | Test store manager flow              | TODO
TASK-119 | END_USER_2    | Test technician edge setup           | TODO
TASK-120 | END_USER_3    | Test mobile app                      | TODO

## SESSION-16: FIX+SIGNOFF | STATUS: TODO
TASK-121 | ALL_DEVS       | Fix all Session-15 issues           | TODO
TASK-122 | SR_CODE_REVIEWER | Final code review                 | TODO
TASK-123 | SR_UI_TESTER   | Re-test all fixes                  | TODO
TASK-124 | ADMIN_AGENT    | Re-test admin flows                | TODO
TASK-125 | END_USER_1     | Re-test store manager              | TODO
TASK-126 | END_USER_2     | Re-test technician                 | TODO
TASK-127 | END_USER_3     | Re-test mobile                     | TODO
TASK-128 | SR_ARCHITECT   | Final architecture sign-off         | TODO

## PREVIOUSLY COMPLETED (from earlier sessions)
- Edge validator Layer 4 duplicate suppression (v2.5.4)
- DeviceController wired into main loop (v2.5.4)
- push_config applies settings (v2.5.4)
- Upload logic uses validator result (v2.5.5)
- Non-blocking live frame capture (v2.5.5)
- Edge frames → S3 not MongoDB (v2.5.1)
- WebSocket broadcast from edge (v2.5.1)
- S3 client connection pooling (v2.5.1)
- Non-blocking S3 upload (v2.5.1)
- Graceful notifications without SMTP (v2.5.1)
- Datetime timezone fix (v2.5.2)
- Health check validates services (v2.5.0)
- Production startup blocks defaults (v2.5.0)
- MinIO running + bucket created (v2.5.2)
- Store manager simplified sidebar (v2.5.1)
- Camera names instead of UUIDs (v2.5.1)
- Roboflow class sync endpoint (dd4c33c)
- Fix yolo26n → yolo11n (dd4c33c)
- TP-Link Kasa controller (d7ea444)
- Store stats endpoint (d7ea444)
- Heartbeat includes model version (d7ea444)
