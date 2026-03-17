# End User Experience Report
# Persona: Store Manager, 3 locations, non-technical

## First Impressions

I logged in at https://app.puddlewatch.com with the provided credentials. The API login worked and returned my user info in about 10 seconds. The root URL (/) loads with HTTP 200, but the /login and /dashboard web pages timed out repeatedly -- I could not actually see the web interface. The API backend is running but the frontend web app appears to be down or extremely slow to load.

The API tells me I am logged in as "Super Admin" with role "super_admin". As a store manager, I should not be seeing that I am a super admin. I just want to see my stores.

When the dashboard does load (based on reading the code), the first thing I see is six stat cards: Total Stores, Total Cameras, Online Cameras, Active Incidents, Events Today, and "Inference Modes: C0 E0 H0". The last one is meaningless to me. I have no idea what C, E, and H stand for (Cloud, Edge, Hybrid inference). I do not care about inference modes. I care about whether my floors are safe.

## Can I tell if my store is safe right now?

Partially, but not easily. The API returned 7 stores including "Downtown Memphis Store", "Midtown Store", and "East Memphis Store" plus 4 test stores that should not be visible to me. The events API returned 11 incidents, several marked "critical" and "new" with no end_time, meaning they are still active and unresolved. That is alarming but I cannot tell which store has an active wet floor RIGHT NOW without cross-referencing store_id UUIDs like "a3f48926-e6b9-48ac-a5f9-54beea6579c6" against the stores list.

On the dashboard, the "Active Incidents" panel shows incidents with severity badges and camera IDs truncated to 8 characters (e.g., "9b897b29..."). That tells me nothing. I need to see "Midtown Store - Aisle 3 Camera" not a UUID fragment.

There is no simple red/green "store safety status" view. No map. No at-a-glance "All Clear" or "WARNING: Wet Floor at Midtown Store" banner. I have to piece together store status from incident tables and detection feeds.

## What confused me

1. **"Inference Modes: C0 E0 H0"** -- completely meaningless. I do not know what cloud vs edge vs hybrid inference is and I do not need to.

2. **"model_source: ROBOFLOW"** -- shown on every detection card. What is Roboflow? I just want to know if the floor is wet.

3. **"Confidence: 74.8%"** -- 74.8% confident about what? Is this good or bad? Should I be worried? There is no explanation.

4. **"wet_area_percent: 0.0%"** -- several "critical" incidents show 0.0% wet area. How can something be critical with no wet area? This is contradictory and confusing.

5. **Camera IDs shown as UUIDs** -- "cam1", "9b897b29-bf3c-4c1f-b4a6-09cfb2e65726" -- these mean nothing to me. I need human names like "Front Entrance Camera" or "Produce Aisle Camera".

6. **Sidebar navigation has 30+ items** organized into sections like "ML & TRAINING", "DETECTION CONTROL", "EDGE MANAGEMENT", "INTEGRATIONS". I manage retail stores. I do not need Dataset Management, Distillation Jobs, Model Registry, Test Inference, API Testing Console, Edge Agents, or Roboflow Integration. Those belong in an engineering dashboard, not mine.

7. **"Detection History"** -- detection of what? The page title should say "Wet Floor Alert History" or "Spill Detection History".

8. **"Incident Management"** -- sounds like an IT helpdesk tool. Should be "Wet Floor Incidents" or "Active Spill Alerts".

9. **"Review Queue"** -- review of what? This needs context: "Review Flagged Alerts" or similar.

10. **"roboflow_sync_status: not_sent"** -- visible in incident data. I have no idea what this means and should never see it.

11. **"Student Model" vs "Roboflow"** in the live monitoring section -- I do not know what a student model is. This is machine learning jargon.

12. **"mAP@50"** in the Model Registry page -- completely incomprehensible metric. Just tell me "Detection Accuracy: 87%" if I ever need to see it.

## What I could not find

1. **Store safety overview** -- a simple page showing all 3 of my stores with green/yellow/red status indicators. "Downtown: All Clear", "Midtown: WET FLOOR DETECTED - Aisle 3", "East Memphis: All Clear".

2. **Response time tracking** -- how long did it take my team to respond to the last spill? Was the floor cleaned in 5 minutes or 45 minutes? There is no response time dashboard.

3. **Weekly/monthly safety report** -- a summary I can show to my regional manager or insurance company. "This month: 12 spills detected, average response time 8 minutes, zero slip-and-fall incidents."

4. **Staff assignment** -- who is responsible for cleaning up the spill? I cannot assign an alert to a specific employee.

5. **Mobile push notification status** -- I see a "Devices" page but I could not confirm if my phone is actually receiving alerts.

6. **Floor plan view** -- I want to see where on my store floor the wet area is, not just which camera caught it.

7. **Simple "I cleaned it" button** -- when my staff cleans up a spill, they need a dead-simple one-tap confirmation, not an "Acknowledge" then "Resolve" two-step workflow with "false_positive" as an option (my cleaning staff does not know what a false positive is).

8. **Cost/liability summary** -- how much money has this system saved me by catching spills quickly?

## What gave me errors

1. **Web frontend timeout** -- both /login and /dashboard pages returned HTTP status 000 (connection timeout) after 15 seconds. The web app is not loading. Only the API backend is responsive.

2. **Detection history API timeout** -- the /api/v1/detection/history endpoint timed out on first attempt. It worked on the second try but this would be frustrating in daily use.

3. **Test/dummy data visible** -- the stores list shows "Test Store", "Test Store Updated", "Production Test Store" alongside my real stores. There are 7 stores when I only have 3. Test data should never be visible in a production system.

4. **Dummy incident notes** -- incidents contain notes like "Dummy incident #7 for testing" and "Dummy incident #3 for testing". This looks unprofessional and suggests the system is not production-ready.

5. **Inconsistent severity** -- incidents marked "critical" have 0% wet area and 0% confidence. If the system cannot detect wet area, why is it marking the incident as critical?

## My top 3 requests

1. **Give me a simple store status dashboard** -- one screen, three stores, big green/red indicators. "All stores safe" or "WARNING: Midtown Store has an active wet floor alert." That is all I need 90% of the time. Everything else is secondary.

2. **Fix the web app so it actually loads** -- the API works but the web interface times out. I cannot use a system that does not load. My assistant managers will give up after one failed page load.

3. **Hide all engineering/ML features from store managers** -- I should see at most 5-6 menu items: Dashboard, My Stores, Alerts, Clips, Reports, Settings. Not 30+ items covering model training, dataset management, edge agents, API testing, and Roboflow integration. Create a separate "Admin" or "Engineering" portal for those.

## Rating: 3/10

The backend API is functional and the system can detect wet floors, which is the core value. But as a non-technical store manager, I cannot actually use this system day-to-day because: (a) the web app does not load, (b) the interface is designed for ML engineers not retail managers, (c) there is no simple "are my stores safe right now?" view, and (d) test/dummy data mixed with production data makes it feel unreliable.

## Suggested improvements

### Label and terminology changes
- "Dashboard" stats card "Inference Modes: C0 E0 H0" --> remove entirely for store_owner role, or replace with "System Status: All Cameras Active"
- "Detection History" --> "Wet Floor Alert History"
- "Incident Management" --> "Active Spill Alerts"
- "Review Queue" --> "Review Flagged Alerts"
- "Live Monitoring" --> "Live Camera Feeds"
- "Recorded Clips" --> "Saved Video Clips"
- "Edge Agents" --> "Store Camera Systems" (or hide entirely from store managers)
- "Roboflow Integration" --> hide from store managers completely
- "API Integration Manager" --> hide from store managers completely
- "API Testing Console" --> hide from store managers completely
- "Detection Control Center" --> hide from store managers completely
- "Class Manager" --> hide from store managers completely
- "Dataset Management" --> hide from store managers completely
- "Training Data Explorer" --> hide from store managers completely
- "Distillation Jobs" --> hide from store managers completely
- "Model Registry" --> hide from store managers completely
- "Test Inference" --> hide from store managers completely
- "System Logs & Audit" --> hide from store managers completely
- Camera dropdown "[CLOUD]" / "[EDGE]" suffix --> remove for store managers
- "model_source: ROBOFLOW" badge on detection cards --> hide from store managers
- "Confidence: 74.8%" --> "Detection Certainty: High/Medium/Low" (translate the number into plain language)
- "wet_area_percent" --> "Estimated Spill Size: Small/Medium/Large"
- "mAP@50", "precision", "recall", "f1" --> "Detection Accuracy: 87%" (one simple number)
- "Student Model" / "Teacher Model" --> hide this distinction from store managers
- Camera IDs like "9b897b29..." --> always show human-readable camera name and store name
- Incident notes "Dummy incident #7 for testing" --> purge all test data from production
- "false_positive" button --> "This was not a real spill" (plain English)
- "Acknowledge" button --> "I see this alert"
- "Resolve" button --> "Spill has been cleaned up"
- "roboflow_sync_status: not_sent" --> hide from store managers completely

### Structural improvements
- Add a "Store Safety Overview" page as the default landing page for store_owner role: 3 cards, one per store, big green check or red warning icon
- Add a "Weekly Safety Report" auto-generated page with charts showing spills detected, average response time, and cleanup rate
- Reduce sidebar to 5-6 items for store_owner role (the RBAC system already supports this but the role filtering is too permissive -- store_owner sees "ALL_ROLES" items including Detection History which uses ML jargon)
- Add staff assignment to incidents (assign cleanup to a named employee)
- Add a single "Cleaned Up" button for floor staff on mobile (skip the acknowledge/resolve two-step)
- Remove or archive all test/dummy stores and incidents from production database
