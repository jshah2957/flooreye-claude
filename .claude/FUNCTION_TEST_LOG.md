# FloorEye v2.0 — Function Test Log
# Date: 2026-03-16 (Session 23)

## Performance
| Metric | Before | After |
|--------|--------|-------|
| Login time | 6.252s | 0.126s |
| Pytest suite | 5.80s | 1.79s |
| API response (avg) | ~200ms | ~50ms |

## Test Data Created
- 6 users (admin + 5 roles)
- 3 stores (Downtown, Midtown, East Memphis)
- 7 cameras (3+2+2 across stores, 1 real Dahua camera)
- 3 IoT devices (sign, alarm, light)
- 3 notification rules (email, webhook, push)

## Function Test Results (26 GET endpoints)
| Endpoint | Status |
|----------|--------|
| GET /stores | PASS |
| GET /cameras | PASS |
| GET /detection/history | PASS |
| GET /continuous/status | PASS |
| GET /events | PASS |
| GET /dataset/frames | PASS |
| GET /dataset/stats | PASS |
| GET /models | PASS |
| GET /training/jobs | PASS |
| GET /devices | PASS (fixed schema) |
| GET /edge/agents | PASS |
| GET /notifications/rules | PASS (fixed schema) |
| GET /notifications/deliveries | PASS |
| GET /detection-control/settings | PASS |
| GET /detection-control/effective/{cam} | PASS |
| GET /validation/queue | PASS |
| GET /active-learning/queue | PASS |
| GET /auth/users | PASS |
| GET /integrations | PASS |
| GET /integrations/status | PASS |
| GET /storage/config | PASS |
| GET /logs | PASS |
| GET /clips | PASS |
| GET /mobile/dashboard | PASS |
| GET /annotations/labels | PASS |
| GET /annotations/export/coco | PASS |

**Total: 26/26 PASS**

## Issues Fixed This Session
1. bcrypt rounds 12 → 10 (login 6.2s → 0.13s)
2. MongoDB connection pooling (50/5 pool, timeouts)
3. TanStack Query gcTime + refetchOnMount disabled
4. Vite code splitting (vendor/query/axios chunks)
5. camera_service time.sleep → asyncio.sleep
6. DeviceResponse: control_method + status made Optional
7. NotificationRuleResponse: min_severity/confidence/area/quiet_hours made Optional
8. Admin password re-hashed with 10 rounds
