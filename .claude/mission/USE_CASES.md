# FloorEye Use Cases
# TASK-006, TASK-007, TASK-008

## EDGE APP USE CASES

UC-E01: Store technician adds new camera
  Actor: Technician
  Steps: Configure RTSP URL in .env → restart agent → camera appears in cloud
  Expected: Camera streams, detections start within 30 seconds

UC-E02: Wet floor detected
  Actor: System (automatic)
  Steps: Camera captures frame → ONNX inference → 4-layer validation passes →
         frame saved locally → uploaded to cloud → TP-Link sign turns ON →
         email sent → push notification sent → dashboard shows alert
  Expected: End-to-end in under 3 seconds

UC-E03: Floor dries after spill
  Actor: System (automatic)
  Steps: Subsequent frames show no wet detection → after 5-min cooldown expires →
         next detection cycle finds floor dry → TP-Link sign turns OFF after timer
  Expected: Sign auto-OFF after configurable timer (default 10 min)

UC-E04: Internet connection drops
  Actor: System (automatic)
  Steps: Upload fails → detection buffered in Redis queue → detection continues
         locally → when internet restores → buffer drains to cloud automatically
  Expected: Zero detection data loss, local TP-Link still works

UC-E05: Cloud pushes new model
  Actor: Admin (via cloud dashboard)
  Steps: Admin promotes model → command created → edge polls → downloads ONNX →
         verifies SHA256 → hot-reloads without stopping → confirms to cloud
  Expected: Model swapped in under 60 seconds, no detection downtime

UC-E06: Cloud sends floor boundary
  Actor: Admin (via camera settings)
  Steps: Admin draws polygon on camera frame → pushed to edge →
         edge saves floor_boundary.json → Layer 2 validation uses boundary
  Expected: Detections outside boundary ignored immediately

## CLOUD APP USE CASES

UC-C01: Store manager checks safety status
  Actor: Store Manager
  Steps: Login → see ALL CLEAR or ALERT banner → view per-store status
  Expected: Immediately know if any store has active wet floor

UC-C02: Admin reviews detection
  Actor: Admin
  Steps: Open Detection Review → see annotated frame → accept or reject →
         if accepted: frame added to training dataset
  Expected: Human-in-loop quality control for model improvement

UC-C03: Admin manages models
  Actor: Admin
  Steps: Upload ONNX → view metrics → compare with current → promote to production →
         system auto-deploys to all edge devices
  Expected: One-click model deployment across all stores

UC-C04: Admin configures detection rules
  Actor: Admin
  Steps: Create rule: "IF wet floor AND sign ON → suppress duplicate alert" →
         save → rule applied immediately across all stores
  Expected: Intelligent alert management reducing noise

UC-C05: Admin views live camera
  Actor: Admin
  Steps: Select store → select camera → view live feed with detection overlay →
         optionally record clip → extract frame
  Expected: Real-time visibility into any store camera

UC-C06: Admin views analytics
  Actor: Admin
  Steps: Open Analytics → view detection trends → per-store breakdown →
         response time tracking → export as PDF
  Expected: Data-driven safety management decisions

## MOBILE APP USE CASES

UC-M01: Manager receives push notification
  Actor: Store Manager (on phone)
  Steps: FCM push arrives → tap → opens detection detail →
         see annotated frame + clip → acknowledge incident
  Expected: Instant awareness + action from anywhere

UC-M02: Executive checks analytics
  Actor: Executive
  Steps: Open mobile app → view dashboard → detection counts →
         per-store breakdown → trend charts
  Expected: Quick overview of safety across all locations

UC-M03: Manager controls IoT remotely
  Actor: Store Manager
  Steps: Open IoT status → see all devices → tap to override ON/OFF
  Expected: Remote caution sign control from mobile
