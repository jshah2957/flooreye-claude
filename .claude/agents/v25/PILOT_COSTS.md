# FloorEye Pilot Cost Analysis
## 3 Stores, 18 Cameras, ~100 Alerts/Day

**Date:** 2026-03-16
**Scenario:** 3 retail stores, 6 cameras each (18 total), 2 FPS capture, hybrid inference mode, ~100 spill alerts/day across all stores.

> **IMPORTANT:** Pricing below is based on publicly available pricing as of early 2025. Verify current rates on each vendor's pricing page before committing. Links provided for each service.

---

## Inference Math (Key Assumptions)

| Parameter | Value |
|-----------|-------|
| Cameras | 18 |
| Capture FPS | 2 |
| Frames/camera/sec | 2 |
| Total frames/sec | 36 |
| Total frames/hour | 129,600 |
| Operating hours/day | 14 (6am-8pm typical retail) |
| Total frames/day | 1,814,400 |
| Total frames/month (30d) | ~54.4 million |
| Alerts/day | ~100 |
| Alerts/month | ~3,000 |

### Inference Mode: Hybrid (Edge-First)
- **Primary path:** YOLOv8 ONNX on local edge device (FREE, zero API cost)
- **Roboflow escalation:** Only when student model confidence is between 0.50-0.65 (uncertain zone)
- **Estimated escalation rate:** ~2-5% of frames = ~1.1M to 2.7M Roboflow API calls/month
- **Auto-labeling batches:** ~10,000 frames/month for training data

---

## 1. Roboflow (AI Teacher Model — Cloud Inference API)

**Pricing page:** https://roboflow.com/pricing

| Tier | Monthly Cost | Inferences Included | Overage |
|------|-------------|---------------------|---------|
| Free (Starter) | $0 | 1,000 total (not per month — lifetime trial credits) | N/A |
| Launch | $249/mo | 100,000/mo | ~$0.004/inference |
| Business | $999/mo | 500,000/mo | ~$0.002/inference |
| Enterprise | Custom | Custom | Negotiated |

### Pilot Estimate (Hybrid Mode)

With hybrid mode and a well-trained student model, Roboflow is only called for:
- **Uncertain escalations:** ~2% of frames = ~1.1M calls/month
- **Auto-labeling:** ~10,000 calls/month
- **Total:** ~1.1M calls/month

| Scenario | Tier | Monthly Cost |
|----------|------|-------------|
| Best case (1% escalation, ~544K calls) | Business ($999) + 44K overage | ~$1,090/mo |
| Expected (2% escalation, ~1.1M calls) | Business ($999) + 600K overage | ~$2,200/mo |
| Worst case (5% escalation, ~2.7M calls) | Business ($999) + 2.2M overage | ~$5,400/mo |

### Cost Reduction Strategy
- **Train student model aggressively** to reduce escalation rate below 1%
- **Use Roboflow Inference Server (self-hosted)** — Roboflow offers a Docker container for on-premise inference at no per-call cost (requires Roboflow Enterprise or the open-source `inference` package)
- **RECOMMENDED FOR PILOT:** Use `roboflow/inference` open-source Docker container on edge = **$0/mo** for inference, only pay for Roboflow platform features (dataset management, labeling UI)

### Recommended Pilot Approach: Self-Hosted Roboflow Inference
| Item | Cost |
|------|------|
| `roboflow/inference` Docker (Apache 2.0) | **$0** |
| Roboflow Starter (dataset mgmt, labeling) | **$0** (1,000 cloud inferences for testing) |
| Roboflow Launch (if you need cloud API too) | **$249/mo** |

**Pilot estimate: $0-$249/mo**

---

## 2. MongoDB

**Pricing page:** https://www.mongodb.com/pricing
**Live data retrieved:** Yes (via WebFetch)

| Tier | Monthly Cost | Storage | Notes |
|------|-------------|---------|-------|
| Atlas M0 (Free) | $0 | 512 MB | Shared, 100 ops/sec limit |
| Atlas M2 | $9/mo | 2 GB | Shared |
| Atlas M5 | $25/mo | 5 GB | Shared |
| Atlas Flex | $8-30/mo | 5 GB | Usage-based |
| Self-hosted (Docker) | $0 | Unlimited | You manage it |

### Pilot Storage Estimate
- Detection logs: ~54M frames/mo, but only detections stored = ~3,000 alerts/mo x 2KB = ~6 MB/mo
- Camera configs, user data, store data: < 1 MB
- Frame metadata (if stored): ~54M x 100 bytes = ~5.4 GB/mo (trim to last 7 days = ~1.3 GB)
- **Total active data:** ~1-2 GB

### Recommendation
**Self-hosted MongoDB in Docker** is the clear winner for pilot:
- Already in the docker-compose stack
- No storage limits, no ops/sec limits
- Zero cost
- Atlas M0 free tier is too small (512 MB, 100 ops/sec would bottleneck at 36 frames/sec)

**Pilot estimate: $0 (self-hosted Docker)**

---

## 3. Cloudflare Tunnel

**Pricing page:** https://www.cloudflare.com/products/tunnel/

| Tier | Cost | Limits |
|------|------|--------|
| Free (with any Cloudflare account) | **$0** | Unlimited tunnels, unlimited bandwidth |
| Zero Trust (up to 50 users) | **$0** | Includes Tunnel |
| Zero Trust (50+ users) | $7/user/mo | Enterprise features |

### Pilot Analysis
- FloorEye uses 3 tunnels (one per store edge device)
- Tunnels carry: heartbeats, alert uploads, command polling
- Bandwidth: ~100 alerts/day x ~500KB (frame + metadata) = ~50 MB/day = negligible
- **No user seats needed** — tunnels are service-to-service

**Pilot estimate: $0**

---

## 4. Firebase Cloud Messaging (FCM)

**Pricing page:** https://firebase.google.com/pricing

| Feature | Cost |
|---------|------|
| FCM push notifications | **$0 — completely free** |
| No per-message cost | Unlimited messages |
| No monthly cap | N/A |

### Pilot Analysis
- ~100 alerts/day = ~3,000 push notifications/month
- Each alert might fan out to 2-3 store managers = ~9,000 messages/month
- FCM has **no usage-based charges** — it is free at any volume
- Only cost would be if using Firebase Cloud Functions for processing (not needed here)

**Pilot estimate: $0**

---

## 5. MinIO (Self-Hosted Object Storage)

**Pricing page:** https://min.io/pricing

| Tier | Cost | Notes |
|------|------|-------|
| MinIO Community (AGPLv3) | **$0** | Full S3-compatible API, self-hosted |
| MinIO Enterprise | $20K+/yr | Commercial license, support, features |

### Pilot Analysis
- MinIO Community is free for self-hosted use under AGPLv3
- AGPLv3 caveat: if you modify MinIO source code, you must open-source modifications. Using it unmodified as infrastructure is fine.
- Storage needs: ~100 alerts/day x 500KB frame = ~50 MB/day = ~1.5 GB/month
- Clip storage: ~100 alerts x 10-sec clips x 2MB = ~200 MB/day = ~6 GB/month
- **Total: ~7.5 GB/month** — trivial for any server

### Alternative: Cloudflare R2
| Usage | Cost |
|-------|------|
| Storage | $0.015/GB/mo |
| Class A ops (writes) | $4.50/million |
| Class B ops (reads) | $0.36/million |
| Free tier | 10 GB storage, 1M Class A, 10M Class B/mo |

R2 pilot estimate: **$0** (fits in free tier at ~7.5 GB/mo)

**Pilot estimate: $0 (MinIO self-hosted) or $0 (R2 free tier)**

---

## 6. SendGrid (Email Alerts)

**Pricing page:** https://sendgrid.com/en-us/pricing

| Tier | Cost | Limit |
|------|------|-------|
| Free | $0 | 100 emails/day (3,000/month) |
| Essentials | $19.95/mo | 50,000 emails/mo |
| Pro | $89.95/mo | 100,000 emails/mo |

### Pilot Analysis
- ~100 alerts/day, each emailed to 1-2 managers = ~150-200 emails/day
- Daily digest emails: 3-6 per day
- Total: ~200 emails/day = ~6,000/month
- **Free tier (100/day) is NOT enough** — need Essentials

### Alternative: Gmail SMTP (via Google Workspace)
- Google Workspace: $7.20/user/mo (includes SMTP relay)
- Gmail SMTP relay limit: 2,000 emails/day (Business Starter)
- If you already have Google Workspace, this is free (included)

### Alternative: Amazon SES
- $0.10 per 1,000 emails = ~$0.60/month for 6,000 emails
- Most cost-effective option

**Pilot estimate: $0-$20/mo**
- $0 if using existing Gmail/Workspace SMTP
- $0.60/mo with Amazon SES
- $19.95/mo with SendGrid Essentials

---

## 7. Twilio SMS (Optional SMS Alerts)

**Pricing page:** https://www.twilio.com/en-us/sms/pricing/us

| Item | Cost |
|------|------|
| Phone number (local US) | $1.15/mo |
| Outbound SMS (US) | $0.0079/message |
| Inbound SMS | $0.0079/message |

### Pilot Analysis
- SMS would only be for critical/urgent alerts, not all 100/day
- Estimate: ~10-20 critical SMS/day = ~450-600 SMS/month
- Cost: $1.15 (number) + 600 x $0.0079 = $1.15 + $4.74 = ~$6/month

**Pilot estimate: $6/mo (if SMS enabled) or $0 (push-only)**

---

## 8. VPS/Server Hosting

### Option A: Single VPS (All-in-One for Pilot)

Runs: Backend (FastAPI), MongoDB, Redis, MinIO, Celery worker, Nginx

| Provider | Spec | Monthly Cost |
|----------|------|-------------|
| Hetzner CX31 | 4 vCPU, 8 GB RAM, 80 GB SSD | $8.50/mo |
| Hetzner CX41 | 8 vCPU, 16 GB RAM, 160 GB SSD | $16/mo |
| DigitalOcean Basic | 4 vCPU, 8 GB RAM, 160 GB SSD | $48/mo |
| DigitalOcean Premium | 4 vCPU, 8 GB RAM, 160 GB SSD | $56/mo |
| AWS Lightsail | 4 vCPU, 8 GB RAM, 160 GB SSD | $48/mo |
| Vultr Cloud Compute | 4 vCPU, 8 GB RAM, 160 GB SSD | $48/mo |

**Recommended: Hetzner CX41 (8 vCPU, 16 GB RAM) at $16/mo** — best value for pilot.

### Option B: Edge Devices (Per Store)

Each store needs a small PC running the edge Docker stack.

| Device | Spec | One-Time Cost |
|--------|------|--------------|
| Intel NUC 13 Pro (i5) | 4-core, 16 GB RAM, 256 GB SSD | ~$400-500 |
| Minisforum UM790 Pro | Ryzen 9, 32 GB RAM, 512 GB SSD | ~$550-650 |
| Beelink SER5 | Ryzen 5, 16 GB RAM, 500 GB SSD | ~$280-350 |
| Raspberry Pi 5 (8GB) | ARM, 8 GB RAM, 128 GB SD | ~$100-120 |
| Used Dell Optiplex Micro | i5, 16 GB RAM, 256 GB SSD | ~$150-200 |

**Recommended: Beelink SER5 or used Dell Optiplex** — $150-350 per store.

**Edge hardware (3 stores): $450-$1,050 one-time**

### Option C: Edge + Cloud Hybrid (Recommended)
- 3x edge devices: $450-$1,050 (one-time)
- 1x Hetzner CX41 cloud server: $16/mo
- Total: ~$16/mo recurring + ~$750 one-time

---

## Monthly Cost Summary (Pilot: 3 Stores, 18 Cameras)

### Scenario 1: Maximum Free Tier (Recommended for Pilot)

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Roboflow Inference | $0 | Self-hosted `roboflow/inference` Docker |
| MongoDB | $0 | Self-hosted in Docker |
| Cloudflare Tunnel | $0 | Free tier (3 tunnels) |
| Firebase FCM | $0 | Always free |
| MinIO Storage | $0 | Self-hosted in Docker |
| SendGrid Email | $0 | Free tier (100/day) or use existing SMTP |
| Twilio SMS | $0 | Push-only (no SMS) |
| Cloud VPS (Hetzner) | $16 | CX41 — backend, DB, Redis, MinIO |
| **TOTAL RECURRING** | **$16/mo** | |
| Edge hardware (3x) | $750 | One-time (used Dell Optiplex) |

### Scenario 2: Comfortable Pilot (Some Paid Services)

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Roboflow Launch | $249 | Cloud API for hybrid escalation |
| MongoDB | $0 | Self-hosted |
| Cloudflare Tunnel | $0 | Free |
| Firebase FCM | $0 | Free |
| MinIO / R2 | $0 | Self-hosted or R2 free tier |
| SendGrid Essentials | $20 | 50K emails/mo |
| Twilio SMS | $6 | ~600 critical SMS/mo |
| Cloud VPS (Hetzner) | $16 | CX41 |
| **TOTAL RECURRING** | **$291/mo** | |
| Edge hardware (3x) | $750 | One-time |

### Scenario 3: Full Cloud (No Self-Hosting)

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Roboflow Business | $999 | 500K inferences + overage |
| MongoDB Atlas M5 | $25 | 5 GB managed |
| Cloudflare Tunnel | $0 | Free |
| Firebase FCM | $0 | Free |
| Cloudflare R2 | $0 | Free tier covers pilot |
| SendGrid Essentials | $20 | 50K emails/mo |
| Twilio SMS | $6 | ~600 SMS/mo |
| DigitalOcean Droplet | $48 | 4 vCPU, 8 GB |
| **TOTAL RECURRING** | **$1,098/mo** | |
| Edge hardware (3x) | $750 | One-time |

---

## Annual Cost Projection (First Year)

| Scenario | Monthly | Annual | + Hardware | Total Year 1 |
|----------|---------|--------|------------|--------------|
| Max Free Tier | $16 | $192 | $750 | **$942** |
| Comfortable | $291 | $3,492 | $750 | **$4,242** |
| Full Cloud | $1,098 | $13,176 | $750 | **$13,926** |

---

## Key Recommendations

1. **Start with Scenario 1 (Max Free Tier at $16/mo).** The self-hosted Roboflow inference container plus edge ONNX inference eliminates the largest cost driver entirely.

2. **The biggest variable cost is Roboflow cloud API.** Every 1% reduction in hybrid escalation rate saves ~$100-200/mo. Invest time in training the student model well.

3. **MongoDB self-hosted is a no-brainer for pilot.** Atlas free tier is too constrained (100 ops/sec vs our 36+ frames/sec). Atlas paid tiers add cost with no benefit at pilot scale.

4. **Cloudflare Tunnel + FCM are genuinely free** with no gotchas at pilot scale. These are non-issues.

5. **Email: use Amazon SES ($0.60/mo) or existing SMTP** rather than paying for SendGrid. Only upgrade if you need marketing email features.

6. **SMS is optional.** Push notifications via FCM cover 95% of alert needs. Only add Twilio if store managers specifically request SMS.

7. **Edge hardware:** Buy used Dell Optiplex Micro units ($150-200 each). They run the Docker stack fine on CPU, are quiet, small, and reliable. Avoid Raspberry Pi for production — thermal throttling and SD card reliability are concerns.

---

## Verification Links

| Service | Pricing Page |
|---------|-------------|
| Roboflow | https://roboflow.com/pricing |
| MongoDB Atlas | https://www.mongodb.com/pricing |
| Cloudflare Tunnel | https://www.cloudflare.com/products/tunnel/ |
| Firebase FCM | https://firebase.google.com/pricing |
| MinIO | https://min.io/pricing |
| SendGrid | https://sendgrid.com/en-us/pricing |
| Twilio SMS | https://www.twilio.com/en-us/sms/pricing/us |
| Hetzner Cloud | https://www.hetzner.com/cloud/ |
| Cloudflare R2 | https://www.cloudflare.com/developer-platform/products/r2/ |
| Amazon SES | https://aws.amazon.com/ses/pricing/ |

> **Note:** Prices were compiled from publicly available data as of early 2025. The MongoDB Atlas pricing was verified live. All other prices should be confirmed on vendor websites before budget approval. Roboflow in particular changes pricing frequently.
