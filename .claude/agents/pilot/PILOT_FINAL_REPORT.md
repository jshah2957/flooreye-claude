# FloorEye Pilot Final Report
# Date: 2026-03-17
# Scope: 3 stores, 18 cameras

## VERDICT: GO FOR PILOT

## Pilot Readiness Score: 8/10

---

## WHAT WAS FIXED (this session)

### Backend Pipeline Fixes (SR_BACKEND_DEV)
1. **Edge frames now upload to S3** — POST /frame uploads to MinIO via asyncio.to_thread, stores S3 path, removes base64 from MongoDB
2. **WebSocket broadcast from edge endpoints** — Both /frame and /detection now broadcast to dashboard in real-time
3. **S3 client connection pooling** — Singleton boto3 client, no more connection storms
4. **Non-blocking S3 upload** — Wrapped in asyncio.to_thread() to prevent event loop blocking
5. **Graceful notifications without SMTP** — Email skips gracefully when not configured, FCM/webhook/SMS unaffected

### Infrastructure Fixes (previous sessions)
6. **MinIO started and bucket created** — flooreye-frames bucket ready
7. **Datetime timezone bug fixed** — incident_service handles naive/aware datetime
8. **MinIO healthcheck fixed** — Uses curl instead of mc

---

## WHAT IS WORKING (verified)

| System | Status | Verified By |
|--------|--------|-------------|
| 7 Docker containers | ALL RUNNING | SYS_ADMIN |
| 21 API endpoints | 21/21 PASS | SYS_ADMIN |
| 24 pytest tests | 24/24 PASS (7.17s) | SYS_ADMIN |
| MinIO frame storage | BUCKET READY | SYS_ADMIN |
| Edge agent processing | 50K+ frames, 465ms inference | SYS_ADMIN |
| Store CRUD | CREATE/DELETE working | QA_TESTER |
| Camera CRUD | CREATE/DELETE working | QA_TESTER |
| Detection history | Returning data | QA_TESTER |
| Incident management | Returning data | QA_TESTER |
| Compliance reports | Working (11 incidents, 7/11 cameras) | QA_TESTER |
| Notification rules | 3 rules configured | QA_TESTER |
| Integration configs | 6 connected (Roboflow, MongoDB, Redis, MinIO, CF Tunnel, FCM) | QA_TESTER |
| Health check | MongoDB OK, Redis OK | QA_TESTER |
| WebSocket Pub/Sub | Redis-backed multi-worker | Backend verified |
| FCM push notifications | Authenticated, project flooreye-172d7 | Integration test |
| Store manager view | Simplified 5-item sidebar, ALL CLEAR banner | Frontend verified |
| Role-based access | store_owner sees limited view | Frontend verified |

---

## WHAT NEEDS MANUAL ATTENTION

1. **SMTP credentials** — Email alerts need SendGrid/Gmail SMTP configured in Integration Manager. System works without it (uses FCM push + in-app notifications).

2. **Edge agent confidence calibration** — Current edge output shows conf=645.51 (raw YOLO26n scores, not normalized). The postprocessing correctly handles this but UI may show confusing numbers.

3. **Dummy test data** — 105 dummy records exist in production DB (tagged dummy_data:true). Run `remove_dummy_data.py` before real pilot.

4. **README.md** — Empty file. Should be written before sharing repo with others.

---

## PILOT LAUNCH INSTRUCTIONS

### Day 1 Setup
1. Ensure all 7 containers running: `docker compose -f docker-compose.prod.yml ps`
2. Remove dummy data: `docker compose -f docker-compose.prod.yml exec backend python scripts/remove_dummy_data.py`
3. Create real stores and cameras in admin dashboard
4. Configure SMTP if email alerts desired (optional — push works without it)
5. Verify tunnel: `curl https://app.puddlewatch.com/api/v1/health`

### Edge Device Setup (per store)
1. Provision edge agent from admin dashboard
2. Copy docker-compose.yml + .env to edge device
3. `docker compose up -d`
4. Verify agent registers and starts processing

### Monitoring During Pilot
- Watch MongoDB disk: `docker exec flooreye-mongodb-1 mongosh flooreye --eval "db.stats()"`
- Watch edge errors: `docker logs flooreye-edge-agent --tail=20`
- Watch MinIO usage: MinIO Console at http://localhost:9001
- Check health: `curl https://app.puddlewatch.com/api/v1/health`

---

## ESTIMATED MONTHLY COST: $0-50
(Self-hosted Roboflow inference + free tiers for all services)
