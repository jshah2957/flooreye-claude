import { useState } from "react";
import { Book, ChevronRight, Search, Menu, X } from "lucide-react";

const sections = [
  { id: "getting-started", label: "Getting Started", icon: "rocket" },
  { id: "dashboard", label: "Dashboard", icon: "layout" },
  { id: "stores-cameras", label: "Stores & Cameras", icon: "camera" },
  { id: "detection", label: "Detection", icon: "eye" },
  { id: "training", label: "Training", icon: "brain" },
  { id: "edge-agents", label: "Edge Agents", icon: "server" },
  { id: "api-reference", label: "API Reference", icon: "code" },
  { id: "troubleshooting", label: "Troubleshooting", icon: "wrench" },
] as const;

type SectionId = (typeof sections)[number]["id"];

function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
    case "getting-started":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Getting Started</h2>
          <p className="mb-4 text-gray-600 leading-relaxed">
            FloorEye is an enterprise AI platform for wet floor and spill detection. It uses a teacher-student
            model architecture to detect hazards in real time from your existing security camera feeds.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Logging In</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            Navigate to the login page and enter your email and password. Your account is created by an
            organization administrator. After logging in, you will be redirected to the dashboard.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Navigation</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            The left sidebar provides access to all major sections of the platform:
          </p>
          <ul className="mb-4 ml-6 list-disc space-y-1.5 text-gray-600">
            <li><strong className="text-gray-900">Dashboard</strong> — Real-time overview of detections and incidents</li>
            <li><strong className="text-gray-900">Stores</strong> — Manage your store locations and their cameras</li>
            <li><strong className="text-gray-900">Detection</strong> — View detection history, incidents, and live monitoring</li>
            <li><strong className="text-gray-900">Training</strong> — Manage datasets, training jobs, and models</li>
            <li><strong className="text-gray-900">Edge</strong> — Monitor and manage edge agent deployments</li>
            <li><strong className="text-gray-900">Admin</strong> — User management, logs, and system configuration</li>
          </ul>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Roles & Permissions</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            FloorEye supports role-based access control (RBAC). The available roles are:
          </p>
          <ul className="mb-4 ml-6 list-disc space-y-1.5 text-gray-600">
            <li><strong className="text-gray-900">Super Admin</strong> — Full platform access across all organizations</li>
            <li><strong className="text-gray-900">Org Admin</strong> — Full access within their organization</li>
            <li><strong className="text-gray-900">Store Manager</strong> — Access to assigned stores and their data</li>
            <li><strong className="text-gray-900">Viewer</strong> — Read-only access to dashboards and reports</li>
          </ul>
        </div>
      );

    case "dashboard":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="mb-4 text-gray-600 leading-relaxed">
            The dashboard provides a real-time overview of your floor safety monitoring system.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Stats Cards</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            At the top of the dashboard, you will see summary cards showing:
          </p>
          <ul className="mb-4 ml-6 list-disc space-y-1.5 text-gray-600">
            <li><strong className="text-gray-900">Active Detections</strong> — Number of currently active spill/wet floor detections</li>
            <li><strong className="text-gray-900">Open Incidents</strong> — Incidents that need attention or resolution</li>
            <li><strong className="text-gray-900">Cameras Online</strong> — How many cameras are actively streaming</li>
            <li><strong className="text-gray-900">Avg Response Time</strong> — Average time from detection to resolution</li>
          </ul>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Live Feed</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            The live feed section shows a real-time stream of detection events from all connected cameras.
            Each detection includes the camera name, confidence score, detected class, and a timestamp.
            Click on any detection to view the full frame and associated incident.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Incidents</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            The incidents panel shows recent and active incidents. Incidents are automatically created when
            detections exceed configured thresholds. Each incident tracks the detection timeline, assigned
            responder, and resolution status.
          </p>
        </div>
      );

    case "stores-cameras":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Stores & Cameras</h2>
          <h3 className="mb-2 mt-4 text-lg font-semibold text-gray-900">Adding a Store</h3>
          <ol className="mb-4 ml-6 list-decimal space-y-2 text-gray-600">
            <li>Navigate to <strong className="text-gray-900">Stores</strong> in the sidebar.</li>
            <li>Click <strong className="text-gray-900">Add Store</strong> and fill in the store name, address, and timezone.</li>
            <li>Assign a store manager (optional) and set the floor type.</li>
            <li>Click <strong className="text-gray-900">Create</strong> to save the store.</li>
          </ol>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Configuring Cameras</h3>
          <ol className="mb-4 ml-6 list-decimal space-y-2 text-gray-600">
            <li>Open a store and navigate to the <strong className="text-gray-900">Cameras</strong> tab.</li>
            <li>Click <strong className="text-gray-900">Add Camera</strong> and provide the camera name and RTSP stream URL.</li>
            <li>Set the resolution, frame rate, and detection interval.</li>
            <li>Click <strong className="text-gray-900">Save</strong> to register the camera.</li>
          </ol>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Setting Up ROI (Region of Interest)</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            ROI defines the area of the camera frame that should be monitored for detections. This helps
            reduce false positives from areas that are not floor surfaces.
          </p>
          <ol className="mb-4 ml-6 list-decimal space-y-2 text-gray-600">
            <li>Open a camera&apos;s detail page and click <strong className="text-gray-900">Edit ROI</strong>.</li>
            <li>Use the polygon drawing tool to outline the floor area.</li>
            <li>Click points to create vertices. Close the polygon by clicking the first point.</li>
            <li>Save the ROI. The detection engine will only process detections within this area.</li>
          </ol>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Dry Reference Frame</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            A dry reference frame is a snapshot of the floor in its normal (dry) state. The detection engine
            uses this as a baseline for comparison. Capture a reference frame when the floor is clean and dry,
            during normal lighting conditions.
          </p>
        </div>
      );

    case "detection":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Detection</h2>
          <h3 className="mb-2 mt-4 text-lg font-semibold text-gray-900">How Detections Work</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            FloorEye uses a teacher-student model architecture for spill detection:
          </p>
          <ul className="mb-4 ml-6 list-disc space-y-1.5 text-gray-600">
            <li><strong className="text-gray-900">Teacher Model</strong> — Roboflow Inference API provides high-accuracy cloud-based detection</li>
            <li><strong className="text-gray-900">Student Model</strong> — YOLOv8 ONNX model runs locally on edge devices for real-time inference</li>
            <li><strong className="text-gray-900">4-Layer Validation</strong> — Confidence scoring, temporal consistency, ROI filtering, and dry reference comparison</li>
          </ul>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Detection History</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            The Detection History page shows all detection events. Filter by store, camera, date range,
            or detection class. Each entry shows the confidence score, source model, and whether it was
            escalated to an incident.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Review Queue</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            Detections that fall below the auto-confirm threshold or are flagged for review appear in the
            Review Queue. Reviewers can approve, reject, or correct the detection label. Reviewed detections
            feed back into the training pipeline.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Flagging Detections</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            Any detection can be flagged for further review. Flagged detections are highlighted in the
            review queue and can be used to identify areas where the model needs improvement.
          </p>
        </div>
      );

    case "training":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Training</h2>
          <h3 className="mb-2 mt-4 text-lg font-semibold text-gray-900">Dataset Management</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            The Dataset page lets you manage training frames. Frames are automatically collected from
            detections and can be split into train, validation, and test sets. Use the auto-labeling
            feature to label unlabeled frames using the teacher model.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Training Jobs</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            Start a training job to distill knowledge from the teacher model into a student model.
            Configure the architecture (YOLOv8n/s/m), number of epochs, and augmentation preset.
            Monitor training progress in real time with epoch tracking.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Model Registry</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            The Model Registry stores all trained models with their metrics (mAP, precision, recall).
            Promote a model to production to deploy it to edge agents. Only one model can be active
            in production at a time per organization.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Training Explorer</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            Use the Training Explorer to analyze your dataset distribution. View class balance, label
            source breakdown, camera coverage, and confidence trends. Export your dataset in COCO
            format for external tools.
          </p>
        </div>
      );

    case "edge-agents":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Edge Agents</h2>
          <h3 className="mb-2 mt-4 text-lg font-semibold text-gray-900">Provisioning</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            Edge agents run the student model locally for real-time inference. To provision a new agent:
          </p>
          <ol className="mb-4 ml-6 list-decimal space-y-2 text-gray-600">
            <li>Navigate to <strong className="text-gray-900">Edge Agents</strong> and click <strong className="text-gray-900">Provision Agent</strong>.</li>
            <li>Enter a name and assign it to a store.</li>
            <li>Copy the generated provision token. This is used during the agent setup.</li>
            <li>On the edge device, run the Docker Compose stack with the provision token.</li>
          </ol>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Deploying</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            After provisioning, the edge agent connects to the platform via heartbeats. Deploy the
            latest production model to the agent from the Edge Management page. The agent downloads
            the ONNX model and begins inference.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Monitoring</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            Monitor agent health through the Edge Management page. View heartbeat status, last seen
            timestamp, assigned cameras, and resource usage. Agents that miss heartbeats are flagged
            as offline.
          </p>
        </div>
      );

    case "api-reference":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900">API Reference</h2>
          <p className="mb-4 text-gray-600 leading-relaxed">
            FloorEye provides a comprehensive REST API for all platform functionality. The API uses
            JWT authentication with httpOnly cookies.
          </p>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Interactive Documentation</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            The full interactive API documentation is available at:
          </p>
          <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <code className="text-sm font-medium text-[#0D9488]">/api/v1/docs</code>
            <span className="ml-2 text-sm text-gray-500">-- Swagger UI</span>
          </div>
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <code className="text-sm font-medium text-[#0D9488]">/api/v1/redoc</code>
            <span className="ml-2 text-sm text-gray-500">-- ReDoc</span>
          </div>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Key Endpoints</h3>
          <ul className="mb-4 ml-6 list-disc space-y-1.5 text-gray-600">
            <li><code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">POST /api/v1/auth/login</code> -- Authenticate and receive JWT</li>
            <li><code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">GET /api/v1/stores</code> -- List stores</li>
            <li><code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">GET /api/v1/cameras</code> -- List cameras</li>
            <li><code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">POST /api/v1/detection/infer</code> -- Submit a frame for inference</li>
            <li><code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">GET /api/v1/events</code> -- List detection events</li>
            <li><code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">GET /api/v1/dataset/frames</code> -- List dataset frames</li>
            <li><code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">POST /api/v1/training/jobs</code> -- Start a training job</li>
          </ul>
          <h3 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Authentication</h3>
          <p className="mb-3 text-gray-600 leading-relaxed">
            All API requests (except login) require authentication. The API uses JWT tokens stored in
            httpOnly cookies. Include credentials in your requests or use the Authorization header
            with a Bearer token.
          </p>
        </div>
      );

    case "troubleshooting":
      return (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Troubleshooting</h2>
          <div className="space-y-6">
            {[
              {
                title: "Camera not connecting",
                items: [
                  "Verify the RTSP URL is correct and accessible from the server.",
                  "Check that the camera is powered on and connected to the network.",
                  "Ensure the camera credentials are correct if authentication is required.",
                  "Try accessing the stream directly with VLC or ffplay to confirm it works.",
                ],
              },
              {
                title: "High false positive rate",
                items: [
                  "Ensure the ROI is properly configured to cover only floor areas.",
                  "Update the dry reference frame if lighting conditions have changed.",
                  "Increase the confidence threshold in the Detection Control settings.",
                  "Review and correct false detections in the Review Queue to improve the model.",
                ],
              },
              {
                title: "Edge agent offline",
                items: [
                  "Check that the edge device has network connectivity.",
                  <>Verify the Docker containers are running with <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">docker ps</code>.</>,
                  <>Check container logs with <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">docker compose logs</code>.</>,
                  "Ensure the provision token is valid and has not expired.",
                ],
              },
              {
                title: "Training job failed",
                items: [
                  "Check the error message on the job detail for specific failure reasons.",
                  "Ensure there are enough labeled frames in the dataset (minimum 50 recommended).",
                  "Verify the training worker container is running and has sufficient memory.",
                  "Check that the dataset has frames in both train and validation splits.",
                ],
              },
              {
                title: "Login issues",
                items: [
                  "Verify your email and password are correct.",
                  "Check if your account has been deactivated by an administrator.",
                  "Clear browser cookies and try again.",
                  "Contact your organization administrator if the issue persists.",
                ],
              },
              {
                title: "Notifications not received",
                items: [
                  "Ensure push notifications are enabled in your device settings.",
                  "Check that your device is registered on the Devices page.",
                  "Verify notification rules are configured for your store and event types.",
                  "Check the notification delivery logs in the admin panel.",
                ],
              },
            ].map((section) => (
              <div key={section.title} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="mb-2 text-base font-semibold text-gray-900">{section.title}</h3>
                <ul className="ml-6 list-disc space-y-1.5 text-gray-600">
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

export default function ManualPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("getting-started");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const filteredSections = searchQuery
    ? sections.filter((s) => s.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : sections;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex gap-6">
        {/* Mobile TOC Toggle */}
        <div className="lg:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#0D9488] text-white shadow-lg"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Sidebar TOC - Desktop */}
        <aside className={`
          ${mobileMenuOpen ? "fixed inset-0 z-30 block bg-black/40 lg:relative lg:bg-transparent" : "hidden lg:block"}
          w-64 shrink-0
        `}>
          <div className={`
            ${mobileMenuOpen ? "fixed left-0 top-0 z-40 h-full w-64 overflow-y-auto" : "sticky top-6"}
            rounded-xl border border-gray-200 bg-white p-4 shadow-sm
          `}>
            <div className="mb-4 flex items-center gap-2">
              <Book size={18} className="text-[#0D9488]" />
              <h2 className="text-sm font-semibold text-gray-900">User Manual</h2>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:border-[#0D9488] focus:outline-none focus:ring-1 focus:ring-[#0D9488]/20"
              />
            </div>

            <nav className="space-y-0.5">
              {filteredSections.map((section) => (
                <button key={section.id} onClick={() => { setActiveSection(section.id); setMobileMenuOpen(false); }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    activeSection === section.id
                      ? "bg-teal-50 font-medium text-[#0D9488]"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}>
                  <ChevronRight size={14} className={`shrink-0 ${activeSection === section.id ? "text-[#0D9488]" : "text-gray-400"}`} />
                  {section.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0 flex-1">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <SectionContent id={activeSection} />
          </div>
        </main>
      </div>
    </div>
  );
}
