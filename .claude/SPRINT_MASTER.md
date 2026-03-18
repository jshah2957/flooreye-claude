# FloorEye Sprint Master Plan
# Created: 2026-03-18
# Status: PLANNING COMPLETE
# Last Updated: 2026-03-18

## HONEST SCOPE ASSESSMENT

Total features requested: 60+
Estimated tasks at 15-min each: ~300 tasks
Estimated engineering effort: 450+ hours (per architect assessment)
Available in single session: ~20 tasks realistically

## STRATEGY: PRIORITY TRIAGE

Instead of attempting everything and delivering nothing complete,
this sprint focuses on the TOP 20 TASKS that deliver the most
value for pilot launch. Everything else is documented for future sprints.

## PRIORITY TIERS

### TIER 1 — PILOT BLOCKERS (do now, ~20 tasks)
These are things that MUST work for a 3-store pilot.

### TIER 2 — PILOT ENHANCERS (next sprint)
These improve the pilot but aren't blockers.

### TIER 3 — POST-PILOT (future roadmap)
Full production features.

---

## TIER 1 TASKS — PILOT BLOCKERS

### Track A: Edge Critical Fixes
TASK-001 | SR_EDGE    | Fix validator Layer 4 duplicate suppression | DONE (v2.5.4)
TASK-002 | SR_EDGE    | Wire DeviceController into main loop       | DONE (v2.5.4)
TASK-003 | SR_EDGE    | Fix push_config to apply settings           | DONE (v2.5.4)
TASK-004 | SR_EDGE    | Fix upload logic to use validator result    | DONE (v2.5.5)
TASK-005 | SR_EDGE    | Non-blocking live frame capture             | DONE (v2.5.5)

### Track B: Backend Critical Fixes
TASK-006 | SR_BACKEND | Edge frames upload to S3 not MongoDB        | DONE (v2.5.1)
TASK-007 | SR_BACKEND | WebSocket broadcast from edge endpoints     | DONE (v2.5.1)
TASK-008 | SR_BACKEND | S3 client connection pooling                | DONE (v2.5.1)
TASK-009 | SR_BACKEND | Non-blocking S3 upload (asyncio.to_thread)  | DONE (v2.5.1)
TASK-010 | SR_BACKEND | Graceful notifications without SMTP         | DONE (v2.5.1)
TASK-011 | SR_BACKEND | Datetime timezone fix in incident_service   | DONE (v2.5.2)
TASK-012 | SR_BACKEND | Health check validates MongoDB + Redis      | DONE (v2.5.0)
TASK-013 | SR_BACKEND | Production startup blocks default secrets   | DONE (v2.5.0)

### Track C: Infrastructure
TASK-014 | SYS_ADMIN  | MinIO running + bucket created              | DONE (v2.5.2)
TASK-015 | SYS_ADMIN  | MinIO healthcheck fix (curl not mc)         | DONE (v2.5.2)
TASK-016 | SYS_ADMIN  | Redis authentication configured             | DONE (v2.5.0)
TASK-017 | SYS_ADMIN  | Docker healthchecks on all services         | DONE (v2.2.0)

### Track D: Frontend Critical
TASK-018 | SR_FRONTEND | Store manager simplified sidebar           | DONE (v2.5.1)
TASK-019 | SR_FRONTEND | ALL CLEAR / ALERT banner for store owners  | DONE (v2.5.1)
TASK-020 | SR_FRONTEND | Camera names instead of UUIDs              | DONE (v2.5.1)

### Track E: Remaining Tier 1 (TODO)
TASK-021 | SR_EDGE    | TP-Link Kasa smart plug integration        | TODO
TASK-022 | SR_BACKEND | Roboflow class sync endpoint               | TODO
TASK-023 | SR_FRONTEND | Store detail sections (cameras, incidents) | TODO
TASK-024 | SR_BACKEND | Fix yolo26n → yolo11n in training defaults | TODO
TASK-025 | SR_EDGE    | Local detection data storage structure     | TODO

---

## TIER 2 — PILOT ENHANCERS (next sprint)

TASK-030 | Training pipeline wired into Celery worker
TASK-031 | Model comparison UI
TASK-032 | Detection review batch operations
TASK-033 | Compliance report PDF export
TASK-034 | Mobile push notification deep linking
TASK-035 | Video upload + testing section
TASK-036 | Analytics charts (trend lines, per-store breakdown)
TASK-037 | Detection rules engine UI
TASK-038 | Camera floor boundary editor
TASK-039 | Accuracy testing mode on edge

---

## TIER 3 — POST-PILOT (future roadmap)

TASK-050 | Full knowledge distillation training
TASK-051 | Multi-camera grid live stream
TASK-052 | WebRTC low-latency streaming
TASK-053 | MongoDB authentication in production
TASK-054 | JWT token revocation
TASK-055 | Horizontal scaling (multiple backend workers)
TASK-056 | Multi-region deployment
TASK-057 | Compliance dashboard with scheduling
TASK-058 | Occupancy detection (competitor feature)
TASK-059 | Fall detection (competitor feature)

---

## COMPLETION STATUS

Tasks completed (Tier 1): 20/25
Tasks remaining (Tier 1): 5
Overall pilot readiness: 8/10

## RESUME INSTRUCTIONS
If session breaks: read this file first, continue from first TODO task.
