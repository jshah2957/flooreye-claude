# FloorEye Pilot Readiness Report
# 3 Stores, 18 Cameras
# Date: 2026-03-17

## PILOT READINESS SCORE: 6.5/10

---

## API COST SUMMARY

| Service | Free Tier | Pilot Cost/mo | Verdict |
|---------|-----------|---------------|---------|
| Roboflow (cloud API) | 1,000 lifetime | $250-5,400 depending on escalation rate | SELF-HOST inference server ($0) |
| MongoDB | Self-hosted Docker | $0 | KEEP (Docker) |
| Redis | Self-hosted Docker | $0 | KEEP (Docker) |
| MinIO | Self-hosted, free license | $0 | KEEP |
| Cloudflare Tunnel | Free (unlimited) | $0 | KEEP |
| Firebase FCM | Free (500K msgs/month) | $0 | KEEP |
| SendGrid SMTP | 100 emails/day free | $0 | KEEP for pilot |
| Twilio SMS | $0.0079/msg | ~$24/mo at 100 alerts/day | OPTIONAL |
| VPS Hosting | Varies | $20-50/mo (DigitalOcean/Hetzner) | Already running on local PC |

**Estimated total for pilot: $0-50/month** (if Roboflow self-hosted + free tiers)
**With Roboflow cloud: $250-2,200/month** (depends on escalation rate)

### CRITICAL COST DECISION: Self-host Roboflow inference
The Roboflow open-source `inference` package can run locally in Docker. This eliminates the #1 cost ($250-5,400/mo) and makes the pilot essentially free.

---

## CORE SYSTEM HEALTH

| System | Status | Notes |
|--------|--------|-------|
| Detection Pipeline | NEEDS WORK | Works but cv2 creates new connection per call; blocking S3 upload in async |
| Frame Storage (MinIO) | NEEDS WORK | S3 utils functional but no connection pooling; edge frames skip S3 |
| Model Training | NOT READY | Honest stub — validates prerequisites but doesn't train |
| Edge Processing | READY | Threaded capture, ONNX inference 57-75ms, rate limiting |
| Alerts (Email) | NEEDS CONFIG | Code ready, SMTP not configured |
| Alerts (Push) | READY | FCM v1 API with service account |
| WebSocket | READY | Redis Pub/Sub for multi-worker broadcast |
| API Endpoints | READY | 21/21 returning 200 |

### Weakest Link: Edge → S3 frame upload
Edge detection frames stored as base64 in MongoDB, not uploaded to S3. This will bloat the database during pilot.

### Single Points of Failure
1. Single MongoDB instance (no replica set)
2. Single Redis instance (no persistence guarantee)
3. Single Cloudflare tunnel (auto-reconnects but no failover)

---

## CONFIGURE TODAY (pilot won't work without)

1. **SMTP email** — Configure SendGrid or Gmail in API Integration Manager so alerts actually send
2. **Fix edge frame S3 upload** — Edge router needs to call upload_frame() instead of storing base64 in MongoDB
3. **Start MinIO** — Already done this session, bucket created

## NICE TO HAVE (add mid-pilot)

1. Self-hosted Roboflow inference server (eliminates API cost)
2. Twilio SMS alerts (second notification channel)
3. MongoDB backup script (scheduled daily)
4. README.md with setup instructions

## SKIP UNTIL SCALE

1. AWS S3 / Cloudflare R2 (MinIO sufficient)
2. MongoDB Atlas (Docker instance fine for 18 cameras)
3. Redis Cluster (single instance handles the load)
4. Full training pipeline (collect data during pilot, train manually)

---

## SUGGESTIONS (no changes made)

### Critical (before go-live)
1. Fix edge router to upload frames to S3 instead of MongoDB
2. Configure SMTP for email alerts
3. Add persistent connection for cv2.VideoCapture in detection service
4. Make S3 upload async (wrap boto3 in asyncio.to_thread)

### Recommended (during pilot)
1. Deploy Roboflow inference server locally to eliminate API costs
2. Set up daily MongoDB backup to MinIO
3. Add .env.example missing vars (DOMAIN, FIREBASE_*)
4. Write README.md with deployment instructions
5. Monitor MongoDB disk usage weekly

### Cost Optimization
1. Self-host Roboflow inference = saves $250-5,400/month
2. Use Gmail SMTP free tier = saves $0 (already free)
3. Skip Twilio until needed = saves $24/month
4. Run on existing hardware = saves $20-50/month VPS cost

### Monitor During Pilot
1. MongoDB disk usage (detection_logs growth)
2. Edge agent error rate (422s, timeouts)
3. Detection accuracy (false positive rate)
4. Alert delivery success rate
5. Frame storage growth in MinIO

### Collect for Model Training
1. Every wet detection frame (auto-collected)
2. 10% of dry frames (random sampling)
3. False positive frames flagged by staff
4. Edge escalation frames (uncertain confidence)
