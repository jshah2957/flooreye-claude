PART D — BACKEND API REQUIREMENTS
═══════════════════════════════════════════════════════

D1. API ARCHITECTURE & CONVENTIONS

Base URL
        Development: http://localhost:8000
        Production: https://api.flooreye.com
        All routes: /api/v1/ prefix


Authentication
        Header: Authorization: Bearer <access_token>
        Access token: JWT HS256, 15-minute expiry
        Refresh token: JWT HS256, 7-day expiry, delivered via httpOnly cookie
        flooreye_refresh
        Edge agent token: separate JWT with type: "edge_agent" claim, 180-day expiry


Response Format

 json
 // Success
 { "data": {...}, "meta": { "total": 100, "offset": 0, "limit": 20 } }

 // Error
 { "detail": "Camera not found", "code": "CAMERA_NOT_FOUND", "status": 404 }


Pagination
All list endpoints: ?limit=20&offset=0 (default limit 20, max 100)

Filtering
All list endpoints: ?store_id=X&camera_id=Y&date_from=ISO&date_to=ISO

API Versioning
Routes prefixed /api/v1/ . Future: /api/v2/ without breaking v1.

Rate Limiting
     Auth endpoints: 10 requests/minute per IP
     Inference endpoints: 60 requests/minute per camera
     Standard endpoints: 1000 requests/minute per org




D2. AUTHENTICATION API
 Method     Endpoint                    Description       Auth       Key Request Fields   Key Respo
                                                                                          Fields

 POST        /api/v1/auth/login         Login with        Public      email,               access_
                                        email/password               password             user (id
                                                                                          name, ro
                                                                                          org_id,
                                                                                          store_ac

 POST        /api/v1/auth/refresh       Refresh access    Cookie:    —                    access_
                                        token             refresh
                                                          token

 POST        /api/v1/auth/logout        Invalidate        All        —                    { ok: t
                                        refresh token

 POST        /api/v1/auth/register      Create user       Admin+      email, name,        User objec
                                        (admin only)                 role, org_id,
                                                                     store_access,
                                                                     password

 POST        /api/v1/auth/forgot-       Send reset        Public     email                 { sent:
            password                    email                                             }
Method   Endpoint                  Description          Auth        Key Request Fields    Key Respo
                                                                                          Fields

POST      /api/v1/auth/reset-      Reset password       Public       token,               { ok: t
         password                                                   new_password

GET      /api/v1/auth/me           Get current          All         —                     Full user o
                                   user

PUT      /api/v1/auth/me           Update profile       All         name, password        Updated u

POST      /api/v1/auth/device-     Register mobile      All          token,               { ok: t
         token                     push token                       platform,
                                                                    app_version

DELETE    /api/v1/auth/device-     Remove push          All         —                     { ok: t
         token                     token

GET      /api/v1/auth/users        List users (org-     Admin+       ?                    Paginated
                                   scoped)                          role=X&org_id=Y       list

POST     /api/v1/auth/users        Create user          Admin+      Full user fields      User objec

PUT      /api/v1/auth/users/{id}   Update user          Admin+      Editable fields       Updated u

DELETE   /api/v1/auth/users/{id}   Deactivate user      Admin+      —                     { ok: t




D3. STORE & CAMERA API
Method   Endpoint                                   Description                        Auth

GET      /api/v1/stores                             List stores (org-scoped, user-     Viewer+
                                                    scoped)

POST     /api/v1/stores                             Create store                       Admin+

GET      /api/v1/stores/{id}                        Store detail                       Viewer+

PUT      /api/v1/stores/{id}                        Update store                       Admin+

DELETE   /api/v1/stores/{id}                        Delete store (cascades             Admin+
                                                    cameras)

GET      /api/v1/stores/stats                       Dashboard aggregate statistics     Viewer+

GET      /api/v1/stores/{id}/edge-status            Edge agent status for store        Viewer+

GET      /api/v1/cameras                            List cameras ( ?store_id=X )       Viewer+

POST
        /api/v1/cameras                            Create camera                      Admin+      
Method   Endpoint                               Description                      Auth

GET       /api/v1/cameras/{id}                  Camera detail                    Viewer+

PUT       /api/v1/cameras/{id}                  Update camera config             Admin+

DELETE    /api/v1/cameras/{id}                  Delete camera                    Admin+

POST      /api/v1/cameras/{id}/test             Test connection + capture        Operator+
                                                snapshot

GET       /api/v1/cameras/{id}/quality          Run quality analysis on feed     Operator+

PUT       /api/v1/cameras/{id}/inference-       Change inference mode            Admin+
         mode

POST      /api/v1/cameras/{id}/roi              Save ROI polygon                 Admin+

GET       /api/v1/cameras/{id}/roi              Get active ROI                   Viewer+

POST      /api/v1/cameras/{id}/dry-             Capture dry reference frames     Operator+
         reference

GET       /api/v1/cameras/{id}/dry-             Get active dry reference         Viewer+
         reference




D4. DETECTION API
Method   Endpoint                                  Description                   Auth

POST     /api/v1/detection/run/{camera_id}         Manual detection trigger      Operator+

GET      /api/v1/detection/history                 Detection history (filters:   Viewer+
                                                   camera, store, date, wet,
                                                   model_source,
                                                   min_confidence)

GET      /api/v1/detection/history/{id}            Single detection with         Viewer+
                                                   frame_base64

POST     /api/v1/detection/history/{id}/flag       Toggle flag (incorrect)       Viewer+

POST      /api/v1/detection/history/{id}/add-      Add frame to training         Operator+
         to-training                               dataset

GET      /api/v1/detection/flagged                 List all flagged detections   Admin+

GET      /api/v1/detection/flagged/export          Export flagged as JSON or     Admin+
                                                   Roboflow format
Method   Endpoint                                   Description                   Auth

POST      /api/v1/detection/flagged/upload-to-      Upload flagged to Roboflow    Admin+
         roboflow

GET      /api/v1/continuous/status                  Background detection          Admin+
                                                    service status

POST     /api/v1/continuous/start                   Start continuous detection    Admin+
                                                    for all enabled cameras

POST     /api/v1/continuous/stop                    Stop continuous detection     Admin+
                                                    service




D5. DETECTION CONTROL API (NEW)
Method   Endpoint                          Description    Auth       Key Params

GET       /api/v1/detection-               Get settings   Admin+      ?
         control/settings                  for scope                 scope=global|org|stor

PUT       /api/v1/detection-               Save           Admin+     body: scope + all overrideab
         control/settings                  override
                                           settings for
                                           scope

DELETE    /api/v1/detection-               Reset scope    Admin+      ?scope=X&scope_id=Y
         control/settings                  to inherited

GET       /api/v1/detection-               Fully          Viewer+    —
         control/effective/{camera_id}     resolved
                                           settings for
                                           camera
                                           (after
                                           inheritance)

GET       /api/v1/detection-               Full           Admin+     —
         control/inheritance/{camera_id}   inheritance
                                           chain per
                                           setting

GET       /api/v1/detection-               All            Viewer+    —
         control/classes                   detection
                                           classes for
                                           org

POST      /api/v1/detection-               Create         Admin+      name, display_label,
         control/classes                   custom                    min_confidence, min_a
                                           class                     alert_on_detect
 Method   Endpoint                                Description     Auth     Key Params

 PUT       /api/v1/detection-                     Update          Admin+   Editable fields
          control/classes/{id}                    class config

 DELETE    /api/v1/detection-                     Delete          Admin+   —
          control/classes/{id}                    custom
                                                  class

 GET       /api/v1/detection-                     Class-level     Admin+    ?scope=X&scope_id=Y
          control/class-overrides                 overrides
                                                  for scope

 PUT       /api/v1/detection-                     Save class      Admin+   array of class override objec
          control/class-overrides                 overrides
                                                  for scope

 GET       /api/v1/detection-                     Change          Admin+   Filterable
          control/history                         audit log

 POST      /api/v1/detection-control/bulk- Copy                   Admin+    source_scope, source
          apply                            settings to                     target_camera_ids[]
                                           multiple
                                           cameras

 GET       /api/v1/detection-                     Export          Admin+    ?scope=X&scope_id=Y
          control/export                          scope
                                                  config as
                                                  JSON

 POST      /api/v1/detection-                     Import +        Admin+   Multipart JSON file
          control/import                          apply scope
                                                  config
                                                  JSON


Inheritance Resolution Algorithm (in detection_control_service.py ):

 1. Load global defaults (hardcoded in config)
 2. Load org-level override (if exists) → merge on top of global
 3. Load store-level override (if exists) → merge on top of org
 4. Load camera-level override (if exists) → merge on top of store
 5. Return final merged object + provenance map (which scope set each field)




D6. LIVE STREAM & RECORDING API
 Method   Endpoint                                         Description                           Auth

 GET       /api/v1/live/stream/{camera_id}/frame           Single live frame (JPEG base64)       Viewer
Method   Endpoint                                   Description                            Auth

POST     /api/v1/live/stream/{camera_id}/start      Start stream session                   Operato

POST     /api/v1/live/stream/{camera_id}/stop       Stop stream session                    Operato

POST     /api/v1/live/record/start                  Start clip recording                   Operato

POST     /api/v1/live/record/stop/{rec_id}          Stop recording early                   Operato

GET      /api/v1/live/record/status/{rec_id}        Recording status                       Operato

GET      /api/v1/clips                              List clips ( ?                         Viewer
                                                    store_id&camera_id&status )

DELETE   /api/v1/clips/{id}                         Delete clip + files                    Admin

POST     /api/v1/clips/{id}/extract-frames          Extract N frames from video            Operato

POST     /api/v1/clips/{id}/save-frames             Save extracted frames to dataset       Operato

GET      /api/v1/clips/local/{id}                   Serve local video file                 Viewer

GET      /api/v1/clips/local/thumbnail/{id}         Serve local thumbnail                  Viewer




D7. DATASET & ANNOTATION API
                                                                                                 




Method   Endpoint                                          Description            Auth

GET      /api/v1/dataset/frames                            List frames (filters   Viewer+
                                                           + pagination)

POST     /api/v1/dataset/frames                            Add frame to           Operator+
                                                           dataset

DELETE   /api/v1/dataset/frames/{id}                       Delete single          Admin+
                                                           frame

POST     /api/v1/dataset/frames/bulk-delete                Bulk delete            Admin+

PUT      /api/v1/dataset/frames/{id}/split                 Assign                 ML
                                                           train/val/test split   Engineer+

GET      /api/v1/dataset/stats                             Dataset statistics     Viewer+

POST     /api/v1/dataset/upload-to-roboflow                Upload labeled         Admin+
                                                           frames

POST      /api/v1/dataset/upload-to-roboflow-for-          Upload unlabeled       Admin+
         labeling
 Method    Endpoint                                             Description            Auth

 GET       /api/v1/dataset/sync-settings                        Auto-sync config       Admin+

 PUT       /api/v1/dataset/sync-settings                        Update auto-sync       Admin+

 POST      /api/v1/dataset/auto-label                           Start bulk auto-       ML
                                                                label job              Engineer+

 GET       /api/v1/dataset/auto-label/{job_id}                  Job status             ML
                                                                                       Engineer+

 POST       /api/v1/dataset/auto-                               Approve labeled        ML
           label/{job_id}/approve                               frames                 Engineer+

 GET       /api/v1/dataset/export/coco                          Export COCO zip        ML
                                                                                       Engineer+

 GET       /api/v1/annotations/labels                           Annotation label       Viewer+
                                                                configs

 POST      /api/v1/annotations/labels                           Create label           Admin+

 GET       /api/v1/annotations/frames                           Annotated frames       Viewer+
                                                                list

 POST      /api/v1/annotations/frames/{id}/annotate             Save annotations       Operator+
                                                                for frame

 GET       /api/v1/annotations/export/coco                      Export                 ML
                                                                annotations COCO       Engineer+
                                                                JSON




D8–D11. (Roboflow, Model Registry, Training, Active Learning APIs)
(Same endpoints as defined in prior version — see tables. All prefixed /api/v1/ )



D12. EDGE AGENT API
 Method    Endpoint                                          Description                 Auth

 POST      /api/v1/edge/provision                            Generate edge token +       Admin+
                                                             CF tunnel + docker-
                                                             compose.yml

 POST      /api/v1/edge/register                             Agent self-registers on     Edge
                                                             startup                     Token
 Method    Endpoint                                        Description                  Auth

 POST       /api/v1/edge/heartbeat                         Report health: cpu, ram,     Edge
                                                           fps, buffer, tunnel_status   Token

 POST       /api/v1/edge/frame                             Upload frame +               Edge
                                                           detection result             Token

 POST       /api/v1/edge/detection                         Upload detection result      Edge
                                                           only (no frame payload)      Token

 GET        /api/v1/edge/commands                          Poll for pending             Edge
                                                           commands                     Token

 POST       /api/v1/edge/commands/{id}/ack                 Acknowledge command          Edge
                                                           execution + result           Token

 GET        /api/v1/edge/model/current                     Get assigned model           Edge
                                                           version ID                   Token

 GET        /api/v1/edge/model/download/{version_id}       Download ONNX model          Edge
                                                           weights                      Token

 PUT        /api/v1/edge/config                            Receive pushed config        Edge
                                                           update                       Token

 GET        /api/v1/edge/agents                            List all agents (org-        Admin+
                                                           scoped)

 GET        /api/v1/edge/agents/{id}                       Agent detail + health        Admin+
                                                           history

 DELETE     /api/v1/edge/agents/{id}                       Remove agent                 Admin+

 POST       /api/v1/edge/agents/{id}/command               Send command to agent        Admin+

Command types (sent via agent command queue):

       deploy_model : { model_version_id: "..." }
       push_config : { config: { capture_fps: 2, ... } }
       restart_agent : {}
       reload_model : {}
       ping : {} → agent ACKs with { pong: true, timestamp: ... }




D13. API INTEGRATION MANAGER API (NEW)
 Method    Endpoint                                 Description                         Auth

 GET        /api/v1/integrations                    List all integrations with status   Admin+
 Method     Endpoint                                     Description                         Auth

 GET        /api/v1/integrations/{service}               Get config for service (secrets     Admin+
                                                         masked)

 PUT        /api/v1/integrations/{service}               Save config (encrypted) →           Admin+
                                                         triggers hot-reload

 DELETE     /api/v1/integrations/{service}               Remove config                       Admin+

 POST       /api/v1/integrations/{service}/test          Test connectivity + return result   Admin+

 POST       /api/v1/integrations/test-all                Test all → return summary           Admin+
                                                         JSON

 GET        /api/v1/integrations/history                 Test history (last 200 events)      Admin+

 GET        /api/v1/integrations/status                  Quick health summary                Viewer+
                                                         (unmasked status only)

Service identifiers: roboflow | smtp | webhook | sms | fcm | s3 | minio | r2 | mqtt |
cloudflare-tunnel | mongodb | redis

Test handler examples:

       roboflow : run inference on stored test frame → return latency + class count
       smtp : send real email to admin address → return delivery status
       fcm : send push to admin's registered device → return FCM response
       mqtt : publish + subscribe on test topic → measure RTT
       s3/minio/r2 : write + read + delete 1KB object → return latency
       mongodb : ping + write + read + delete → return RTT
       redis : PING + SET/GET/DEL → return RTT




D14. MOBILE API (NEW)
Dedicated lightweight endpoints for the React Native app. Returns simplified, pre-aggregated
responses optimized for mobile data efficiency.
Method   Endpoint                                          Description         Auth

GET      /api/v1/mobile/dashboard                          Home screen         Store
                                                           data: stats + 10    Owner+
                                                           recent
                                                           detections +
                                                           active incidents
                                                           + camera status
                                                           chips

GET      /api/v1/mobile/stores                             Simplified store    Store
                                                           list for selector   Owner+

GET      /api/v1/mobile/stores/{id}/status                 Real-time store     Store
                                                           status              Owner+
                                                           (WebSocket or
                                                           polling)

GET      /api/v1/mobile/cameras/{id}/frame                 Latest live frame   Store
                                                           (JPEG base64,       Owner+
                                                           compressed for
                                                           mobile)

GET      /api/v1/mobile/alerts                             Paginated alert     Store
                                                           feed (detections    Owner+
                                                           + system)

PUT      /api/v1/mobile/alerts/{incident_id}/acknowledge   Acknowledge         Store
                                                           incident from       Owner+
                                                           mobile

GET      /api/v1/mobile/analytics                          Aggregated          Store
                                                           analytics data      Owner+
                                                           for charts

GET      /api/v1/mobile/analytics/heatmap                  Hour-of-day ×       Store
                                                           day-of-week         Owner+
                                                           heatmap matrix

GET      /api/v1/mobile/incidents/{id}                     Incident detail     Store
                                                           (simplified for     Owner+
                                                           mobile)

GET      /api/v1/mobile/report/generate                    Generate PDF        Store
                                                           report → returns    Owner+
                                                           S3 URL

GET      /api/v1/mobile/profile/notification-prefs         User's push         Store
                                                           notification        Owner+
                                                           preferences
 Method     Endpoint                                                    Description     Auth

 PUT         /api/v1/mobile/profile/notification-prefs                  Update push     Store
                                                                        preferences     Owner+




D15–D20. (Validation, Incidents, Devices, Notifications, Logs, Storage APIs)
(All standard endpoints as defined previously — all prefixed /api/v1/ )



D21. WEBSOCKET CHANNELS
Base URL: wss://api.flooreye.com/ws

 Channel                    Description           Auth        Message Types

  /ws/live-                 Real-time             JWT query    { type: "detection", data:
 detections                 detection stream      param       DetectionObject }
                            for dashboard

  /ws/live-                 Live frame stream     JWT          { type: "frame", data: {
 frame/{camera_id}          for specific camera               base64: "...", timestamp:
                                                              "..." } }

 /ws/incidents              New incident          JWT          { type: "incident_created" |
                            notifications                     "incident_updated", data:
                                                              IncidentObject }

 /ws/edge-status            Edge agent            JWT          { type: "heartbeat", agent_id:
                            heartbeat updates     (Admin+)    "...", data: HeartbeatObject }

  /ws/training-             Training job          JWT (ML      { type: "progress", epoch: N,
 job/{job_id}               progress (loss,       Eng+)       metrics: {...} }
                            mAP curves)

 /ws/system-logs            Real-time log         JWT          { type: "log", level: "INFO",
                            streaming             (Admin+)    message: "...", timestamp:
                                                              "..." }

  /ws/detection-            Config hot-reload     JWT          { type: "config_reloaded",
 control                    confirmation          (Admin+)    scope: "...", scope_id: "..."
                                                              }



WebSocket Architecture:

       Redis Pub/Sub as message broker between FastAPI workers and WebSocket hub
       Each WebSocket connection is scoped to org_id from JWT (no cross-org data leakage)
       Reconnection handled client-side with exponential backoff (1s, 2s, 4s, 8s, max 30s)
═══════════════════════════════════════════════════════

