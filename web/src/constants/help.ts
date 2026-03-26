/** Contextual help text for each page — used by HelpSection component */

export const PAGE_HELP = {
  dashboard: {
    title: "Dashboard Overview",
    content: [
      "The dashboard shows real-time status of your stores, cameras, and detections.",
      "Stat cards show total counts. Click any card to navigate to that section.",
      "The live monitoring grid shows camera feeds. Green dot means camera is online.",
      "Recent detections appear in real-time via WebSocket. Click any detection to see details.",
      "Data auto-refreshes every 15 seconds. Click Refresh for immediate update.",
    ],
  },
  detectionHistory: {
    title: "Detection History",
    content: [
      "Every time the AI analyzes a camera frame, a detection record is created here.",
      "WET detections (highlighted red) mean the AI found a wet floor/spill.",
      "Use filters to narrow results by store, camera, date, confidence, or model source.",
      "Flag detections to mark them for review or training data collection.",
      "Click any detection to see the full frame with bounding boxes.",
      "Gallery view shows thumbnails. Table view shows detailed metadata.",
    ],
  },
  incidents: {
    title: "Incident Management",
    content: [
      "Incidents are created automatically when wet floor detections pass all 4 validation layers.",
      "Severity levels: LOW (single detection), MEDIUM (multiple or moderate confidence), HIGH (large area + high confidence), CRITICAL (extreme).",
      "Lifecycle: NEW → ACKNOWLEDGED (someone saw it) → RESOLVED (cleaned up).",
      "Acknowledge an incident to indicate you are aware. Resolve it after cleanup.",
      "IoT devices (warning signs, alarms) are auto-triggered on new incidents.",
      "Sound alerts play when new incidents arrive (if browser permits).",
    ],
  },
  detectionControl: {
    title: "Detection Control Center",
    content: [
      "Configure how sensitive the detection system is. Settings cascade: Global → Organization → Store → Camera.",
      "Layer 1 (Confidence): Minimum AI confidence to consider a detection valid. Default 70%.",
      "Layer 2 (Area): Minimum wet area as percentage of frame. Filters tiny false positives.",
      "Layer 3 (Temporal): Requires K wet frames in last M frames. Prevents single-frame false alarms.",
      "Layer 4 (Dry Reference): Compares against a 'clean floor' baseline. Detects actual changes.",
      "Each layer can be enabled/disabled independently. Camera-level overrides take priority.",
    ],
  },
  classManager: {
    title: "Detection Classes",
    content: [
      "Classes define what objects the AI model can detect (wet_floor, spill, puddle, etc.).",
      "Enable/disable classes to control which ones trigger alerts.",
      "Alert classes generate incidents and trigger IoT devices when detected.",
      "Non-alert classes are tracked but don't create incidents.",
      "Classes are auto-synced from the ONNX model or Roboflow project.",
    ],
  },
  cameraDetail: {
    title: "Camera Setup",
    content: [
      "Overview: Camera configuration, status, and connection test.",
      "ROI (Region of Interest): Draw the floor area to monitor. Everything outside is ignored by the AI.",
      "Dry Reference: Capture the clean floor state. Used by Layer 4 validation to detect changes.",
      "Live Feed: Real-time camera view with optional detection overlay.",
      "Setup checklist: ROI → Dry Reference → Detection enabled → Ready for detection.",
    ],
  },
  edgeManagement: {
    title: "Edge Agents",
    content: [
      "Edge agents run on-premise at each store, connected to local cameras.",
      "They capture frames, run AI inference locally, and upload results to cloud.",
      "Provision: Creates a new edge agent with a Docker deployment token.",
      "Commands: Ping (test), Restart, Reload Model, Deploy Model.",
      "Health metrics show CPU, RAM, disk, GPU usage in real-time.",
      "Model deployment pushes new ONNX models from cloud to edge automatically.",
    ],
  },
  dataset: {
    title: "Training Dataset",
    content: [
      "Organize frames for AI model training. Frames come from detections, clips, or manual upload.",
      "Folders: Create folders to organize frames by project, date, or camera.",
      "Split: Assign frames to train (80%), val (10%), or test (10%) for model training.",
      "Upload to Roboflow: Send frames to your Roboflow project for annotation and training.",
      "COCO Export: Download frames with annotations in COCO format for local training.",
    ],
  },
  modelRegistry: {
    title: "Model Registry",
    content: [
      "Manage AI model versions. Models flow through: Draft → Staging → Production → Retired.",
      "Pull from Roboflow: Download trained models from your Roboflow project.",
      "Promote to Staging: Mark a model for testing before production deployment.",
      "Promote to Production: Deploy to all edge agents automatically.",
      "Only one model can be in Production at a time. Previous production models are retired.",
    ],
  },
  clips: {
    title: "Video Clips",
    content: [
      "Clips are short video recordings from cameras, triggered manually or by detection events.",
      "Play: Click the thumbnail to watch the clip in the built-in video player.",
      "Extract Frames: Pull individual frames from a clip for training data.",
      "Save to Dataset: Add extracted frames to your training dataset with split assignment.",
      "Download: Save the clip file to your computer.",
    ],
  },
  devices: {
    title: "IoT Devices",
    content: [
      "Configure warning signs, alarms, and smart plugs that activate on wet floor detection.",
      "Supported protocols: TP-Link Kasa (TCP), MQTT, HTTP Webhook.",
      "Devices auto-trigger when incidents are created for their assigned camera/store.",
      "Auto-off: Devices turn off automatically after the configured duration.",
      "Test: Click Trigger to test a device without creating an incident.",
    ],
  },
  notifications: {
    title: "Notification Rules",
    content: [
      "Rules define when and how to send alerts. Each rule matches incidents by severity.",
      "Channels: Email (SMTP), Push (Firebase), SMS (Twilio), Webhook (HTTP POST).",
      "Quiet hours: Suppress notifications during specified times (e.g., overnight).",
      "Recipients: Add email addresses, phone numbers, or webhook URLs per rule.",
      "Test: Send a test notification to verify delivery before going live.",
    ],
  },
  storage: {
    title: "Storage Settings",
    content: [
      "Configure where detection frames, clips, and model files are stored.",
      "S3/MinIO: Object storage for production. Frames are uploaded automatically.",
      "Test: Verify connectivity by uploading and downloading a test file.",
      "Bucket: The S3 bucket name where all files are stored.",
    ],
  },
  compliance: {
    title: "Compliance Reports",
    content: [
      "Track detection and response metrics for regulatory compliance.",
      "Filter by store and date range to generate period-specific reports.",
      "Generate PDF: Create a downloadable compliance report document.",
      "Export CSV: Download raw data for analysis in spreadsheet software.",
      "Camera uptime shows reliability metrics per camera.",
    ],
  },
  apiTester: {
    title: "API Testing Console",
    content: [
      "Send requests to any FloorEye API endpoint and inspect responses.",
      "Your authentication token is automatically included in all requests.",
      "Select an endpoint from the library on the left, or type a custom URL.",
      "Save frequently used requests for quick access later.",
      "Copy as cURL: Get the equivalent command-line command.",
    ],
  },
} as const;
