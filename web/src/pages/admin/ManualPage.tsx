import { useState } from "react";
import { Book, ChevronRight } from "lucide-react";

const sections = [
  { id: "getting-started", label: "Getting Started" },
  { id: "dashboard", label: "Dashboard" },
  { id: "stores-cameras", label: "Stores & Cameras" },
  { id: "detection", label: "Detection" },
  { id: "training", label: "Training" },
  { id: "edge-agents", label: "Edge Agents" },
  { id: "api-reference", label: "API Reference" },
  { id: "troubleshooting", label: "Troubleshooting" },
] as const;

type SectionId = (typeof sections)[number]["id"];

function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
    case "getting-started":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-[#1C1917]">Getting Started</h2>
          <p className="mb-4 text-[#1C1917] leading-relaxed">
            FloorEye is an enterprise AI platform for wet floor and spill detection. It uses a teacher-student
            model architecture to detect hazards in real time from your existing security camera feeds.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Logging In</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            Navigate to the login page and enter your email and password. Your account is created by an
            organization administrator. After logging in, you will be redirected to the dashboard.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Navigation</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            The left sidebar provides access to all major sections of the platform:
          </p>
          <ul className="mb-4 ml-6 list-disc space-y-1 text-[#1C1917]">
            <li><strong>Dashboard</strong> — Real-time overview of detections and incidents</li>
            <li><strong>Stores</strong> — Manage your store locations and their cameras</li>
            <li><strong>Detection</strong> — View detection history, incidents, and live monitoring</li>
            <li><strong>Training</strong> — Manage datasets, training jobs, and models</li>
            <li><strong>Edge</strong> — Monitor and manage edge agent deployments</li>
            <li><strong>Admin</strong> — User management, logs, and system configuration</li>
          </ul>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Roles & Permissions</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            FloorEye supports role-based access control (RBAC). The available roles are:
          </p>
          <ul className="mb-4 ml-6 list-disc space-y-1 text-[#1C1917]">
            <li><strong>Super Admin</strong> — Full platform access across all organizations</li>
            <li><strong>Org Admin</strong> — Full access within their organization</li>
            <li><strong>Store Manager</strong> — Access to assigned stores and their data</li>
            <li><strong>Viewer</strong> — Read-only access to dashboards and reports</li>
          </ul>
        </div>
      );

    case "dashboard":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-[#1C1917]">Dashboard</h2>
          <p className="mb-4 text-[#1C1917] leading-relaxed">
            The dashboard provides a real-time overview of your floor safety monitoring system.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Stats Cards</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            At the top of the dashboard, you will see summary cards showing:
          </p>
          <ul className="mb-4 ml-6 list-disc space-y-1 text-[#1C1917]">
            <li><strong>Active Detections</strong> — Number of currently active spill/wet floor detections</li>
            <li><strong>Open Incidents</strong> — Incidents that need attention or resolution</li>
            <li><strong>Cameras Online</strong> — How many cameras are actively streaming</li>
            <li><strong>Avg Response Time</strong> — Average time from detection to resolution</li>
          </ul>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Live Feed</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            The live feed section shows a real-time stream of detection events from all connected cameras.
            Each detection includes the camera name, confidence score, detected class, and a timestamp.
            Click on any detection to view the full frame and associated incident.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Incidents</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            The incidents panel shows recent and active incidents. Incidents are automatically created when
            detections exceed configured thresholds. Each incident tracks the detection timeline, assigned
            responder, and resolution status.
          </p>
        </div>
      );

    case "stores-cameras":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-[#1C1917]">Stores & Cameras</h2>
          <h3 className="mb-2 mt-4 text-lg font-semibold text-[#1C1917]">Adding a Store</h3>
          <ol className="mb-4 ml-6 list-decimal space-y-2 text-[#1C1917]">
            <li>Navigate to <strong>Stores</strong> in the sidebar.</li>
            <li>Click <strong>Add Store</strong> and fill in the store name, address, and timezone.</li>
            <li>Assign a store manager (optional) and set the floor type.</li>
            <li>Click <strong>Create</strong> to save the store.</li>
          </ol>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Configuring Cameras</h3>
          <ol className="mb-4 ml-6 list-decimal space-y-2 text-[#1C1917]">
            <li>Open a store and navigate to the <strong>Cameras</strong> tab.</li>
            <li>Click <strong>Add Camera</strong> and provide the camera name and RTSP stream URL.</li>
            <li>Set the resolution, frame rate, and detection interval.</li>
            <li>Click <strong>Save</strong> to register the camera.</li>
          </ol>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Setting Up ROI (Region of Interest)</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            ROI defines the area of the camera frame that should be monitored for detections. This helps
            reduce false positives from areas that are not floor surfaces.
          </p>
          <ol className="mb-4 ml-6 list-decimal space-y-2 text-[#1C1917]">
            <li>Open a camera&apos;s detail page and click <strong>Edit ROI</strong>.</li>
            <li>Use the polygon drawing tool to outline the floor area.</li>
            <li>Click points to create vertices. Close the polygon by clicking the first point.</li>
            <li>Save the ROI. The detection engine will only process detections within this area.</li>
          </ol>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Dry Reference Frame</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            A dry reference frame is a snapshot of the floor in its normal (dry) state. The detection engine
            uses this as a baseline for comparison. Capture a reference frame when the floor is clean and dry,
            during normal lighting conditions.
          </p>
        </div>
      );

    case "detection":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-[#1C1917]">Detection</h2>
          <h3 className="mb-2 mt-4 text-lg font-semibold text-[#1C1917]">How Detections Work</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            FloorEye uses a teacher-student model architecture for spill detection:
          </p>
          <ul className="mb-4 ml-6 list-disc space-y-1 text-[#1C1917]">
            <li><strong>Teacher Model</strong> — Roboflow Inference API provides high-accuracy cloud-based detection</li>
            <li><strong>Student Model</strong> — YOLO26 ONNX model runs locally on edge devices for real-time inference</li>
            <li><strong>4-Layer Validation</strong> — Confidence scoring, temporal consistency, ROI filtering, and dry reference comparison</li>
          </ul>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Detection History</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            The Detection History page shows all detection events. Filter by store, camera, date range,
            or detection class. Each entry shows the confidence score, source model, and whether it was
            escalated to an incident.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Review Queue</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            Detections that fall below the auto-confirm threshold or are flagged for review appear in the
            Review Queue. Reviewers can approve, reject, or correct the detection label. Reviewed detections
            feed back into the training pipeline.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Flagging Detections</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            Any detection can be flagged for further review. Flagged detections are highlighted in the
            review queue and can be used to identify areas where the model needs improvement.
          </p>
        </div>
      );

    case "training":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-[#1C1917]">Training</h2>
          <h3 className="mb-2 mt-4 text-lg font-semibold text-[#1C1917]">Dataset Management</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            The Dataset page lets you manage training frames. Frames are automatically collected from
            detections and can be split into train, validation, and test sets. Use the auto-labeling
            feature to label unlabeled frames using the teacher model.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Training Jobs</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            Start a training job to distill knowledge from the teacher model into a student model.
            Configure the architecture (YOLO26n/s/m), number of epochs, and augmentation preset.
            Monitor training progress in real time with epoch tracking.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Model Registry</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            The Model Registry stores all trained models with their metrics (mAP, precision, recall).
            Promote a model to production to deploy it to edge agents. Only one model can be active
            in production at a time per organization.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Training Explorer</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            Use the Training Explorer to analyze your dataset distribution. View class balance, label
            source breakdown, camera coverage, and confidence trends. Export your dataset in COCO
            format for external tools.
          </p>
        </div>
      );

    case "edge-agents":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-[#1C1917]">Edge Agents</h2>
          <h3 className="mb-2 mt-4 text-lg font-semibold text-[#1C1917]">Provisioning</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            Edge agents run the student model locally for real-time inference. To provision a new agent:
          </p>
          <ol className="mb-4 ml-6 list-decimal space-y-2 text-[#1C1917]">
            <li>Navigate to <strong>Edge Agents</strong> and click <strong>Provision Agent</strong>.</li>
            <li>Enter a name and assign it to a store.</li>
            <li>Copy the generated provision token. This is used during the agent setup.</li>
            <li>On the edge device, run the Docker Compose stack with the provision token.</li>
          </ol>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Deploying</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            After provisioning, the edge agent connects to the platform via heartbeats. Deploy the
            latest production model to the agent from the Edge Management page. The agent downloads
            the ONNX model and begins inference.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Monitoring</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            Monitor agent health through the Edge Management page. View heartbeat status, last seen
            timestamp, assigned cameras, and resource usage. Agents that miss heartbeats are flagged
            as offline.
          </p>
        </div>
      );

    case "api-reference":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-[#1C1917]">API Reference</h2>
          <p className="mb-4 text-[#1C1917] leading-relaxed">
            FloorEye provides a comprehensive REST API for all platform functionality. The API uses
            JWT authentication with httpOnly cookies.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Interactive Documentation</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            The full interactive API documentation is available at:
          </p>
          <div className="mb-4 rounded-md border border-[#E7E5E0] bg-[#F8F7F4] p-3">
            <code className="text-sm text-[#0D9488]">/api/v1/docs</code>
            <span className="ml-2 text-sm text-[#78716C]">— Swagger UI</span>
          </div>
          <div className="mb-4 rounded-md border border-[#E7E5E0] bg-[#F8F7F4] p-3">
            <code className="text-sm text-[#0D9488]">/api/v1/redoc</code>
            <span className="ml-2 text-sm text-[#78716C]">— ReDoc</span>
          </div>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Key Endpoints</h3>
          <ul className="mb-4 ml-6 list-disc space-y-1 text-[#1C1917]">
            <li><code className="text-sm">POST /api/v1/auth/login</code> — Authenticate and receive JWT</li>
            <li><code className="text-sm">GET /api/v1/stores</code> — List stores</li>
            <li><code className="text-sm">GET /api/v1/cameras</code> — List cameras</li>
            <li><code className="text-sm">POST /api/v1/detection/infer</code> — Submit a frame for inference</li>
            <li><code className="text-sm">GET /api/v1/events</code> — List detection events</li>
            <li><code className="text-sm">GET /api/v1/dataset/frames</code> — List dataset frames</li>
            <li><code className="text-sm">POST /api/v1/training/jobs</code> — Start a training job</li>
          </ul>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-[#1C1917]">Authentication</h3>
          <p className="mb-3 text-[#1C1917] leading-relaxed">
            All API requests (except login) require authentication. The API uses JWT tokens stored in
            httpOnly cookies. Include credentials in your requests or use the Authorization header
            with a Bearer token.
          </p>
        </div>
      );

    case "troubleshooting":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-[#1C1917]">Troubleshooting</h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-lg font-semibold text-[#1C1917]">Camera not connecting</h3>
              <ul className="ml-6 list-disc space-y-1 text-[#1C1917]">
                <li>Verify the RTSP URL is correct and accessible from the server.</li>
                <li>Check that the camera is powered on and connected to the network.</li>
                <li>Ensure the camera credentials are correct if authentication is required.</li>
                <li>Try accessing the stream directly with VLC or ffplay to confirm it works.</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-semibold text-[#1C1917]">High false positive rate</h3>
              <ul className="ml-6 list-disc space-y-1 text-[#1C1917]">
                <li>Ensure the ROI is properly configured to cover only floor areas.</li>
                <li>Update the dry reference frame if lighting conditions have changed.</li>
                <li>Increase the confidence threshold in the Detection Control settings.</li>
                <li>Review and correct false detections in the Review Queue to improve the model.</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-semibold text-[#1C1917]">Edge agent offline</h3>
              <ul className="ml-6 list-disc space-y-1 text-[#1C1917]">
                <li>Check that the edge device has network connectivity.</li>
                <li>Verify the Docker containers are running with <code className="text-sm bg-[#F8F7F4] px-1 rounded">docker ps</code>.</li>
                <li>Check container logs with <code className="text-sm bg-[#F8F7F4] px-1 rounded">docker compose logs</code>.</li>
                <li>Ensure the provision token is valid and has not expired.</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-semibold text-[#1C1917]">Training job failed</h3>
              <ul className="ml-6 list-disc space-y-1 text-[#1C1917]">
                <li>Check the error message on the job detail for specific failure reasons.</li>
                <li>Ensure there are enough labeled frames in the dataset (minimum 50 recommended).</li>
                <li>Verify the training worker container is running and has sufficient memory.</li>
                <li>Check that the dataset has frames in both train and validation splits.</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-semibold text-[#1C1917]">Login issues</h3>
              <ul className="ml-6 list-disc space-y-1 text-[#1C1917]">
                <li>Verify your email and password are correct.</li>
                <li>Check if your account has been deactivated by an administrator.</li>
                <li>Clear browser cookies and try again.</li>
                <li>Contact your organization administrator if the issue persists.</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-semibold text-[#1C1917]">Notifications not received</h3>
              <ul className="ml-6 list-disc space-y-1 text-[#1C1917]">
                <li>Ensure push notifications are enabled in your device settings.</li>
                <li>Check that your device is registered on the Devices page.</li>
                <li>Verify notification rules are configured for your store and event types.</li>
                <li>Check the notification delivery logs in the admin panel.</li>
              </ul>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}

export default function ManualPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("getting-started");

  return (
    <div className="flex min-h-screen bg-[#F8F7F4]">
      {/* Left Sidebar - Table of Contents */}
      <aside className="w-56 shrink-0 border-r border-[#E7E5E0] bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <Book size={18} className="text-[#0D9488]" />
          <h2 className="text-sm font-semibold text-[#1C1917]">User Manual</h2>
        </div>
        <nav className="space-y-1">
          {sections.map((section) => (
            <button key={section.id} onClick={() => setActiveSection(section.id)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                activeSection === section.id
                  ? "bg-[#0D9488]/10 font-medium text-[#0D9488]"
                  : "text-[#78716C] hover:bg-[#F8F7F4] hover:text-[#1C1917]"
              }`}>
              <ChevronRight size={14} className={activeSection === section.id ? "text-[#0D9488]" : "text-[#78716C]"} />
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-3xl rounded-lg border border-[#E7E5E0] bg-white p-8">
          <SectionContent id={activeSection} />
        </div>
      </main>
    </div>
  );
}
