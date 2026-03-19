# FloorEye Live Application Test Results
# Date: 2026-03-19
# Tested against: https://app.puddlewatch.com (live)
# Method: Real HTTP calls, not code reading

## LIVE SYSTEM STATUS
- Web app: 200 (350ms via CF Tunnel)
- API health: 200, v3.1.0, MongoDB ok, Redis ok
- Containers: 7/7 running
- Edge agent: 385K+ frames, cam1 connected, 70ms inference
- Real camera: 1920x1080 CONNECTED

## LIVE TEST RESULTS (22 tests)
LOGIN: PASS (admin@puddlewatch.com)
STORES LIST: PASS (7 stores, 3 real Memphis stores)
CAMERAS LIST: PASS (11 total, 7 online)
ACTIVE INCIDENTS: PASS (5 active)
RECENT DETECTIONS: PASS (3 returned with real data)
EDGE AGENTS: PASS (1 online, version 2.0.0)
INTEGRATIONS: PASS (6/6 critical connected)
COMPLIANCE REPORT: PASS (206 incidents, 7/11 cameras)
STORE STATS: PASS (returns real camera/incident counts)
STORE CAMERAS TAB: PASS (3 cameras for Downtown store)
STORE INCIDENTS TAB: PASS (returns filtered incidents)
LIVE FRAME CAPTURE: PASS (frame captured from Entrance Cam)
NOTIFICATION RULES: PASS (4 rules configured)
NOTIFICATIONS DELIVERIES: PASS
MODELS REGISTRY: PASS (0 models, clean after dummy removal)
DETECTION CONTROL: PASS (global settings returned)
VALIDATION QUEUE: PASS
ACTIVE LEARNING: PASS
ROBOFLOW CLASSES: PASS
USERS LIST: PASS
AUDIT LOGS: PASS
HEALTH CHECK: PASS (v3.1.0, MongoDB ok, Redis ok)

## KNOWN ITEMS
1. Historical detection confidence values in DB show 640+
   (from before sigmoid fix). New detections will be normalized.
   Not a bug — fix prevents future bad values.

## VERDICT: ALL 22 LIVE TESTS PASS
