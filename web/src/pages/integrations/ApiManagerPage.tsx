import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cloud,
  Mail,
  Webhook,
  MessageSquare,
  Bell,
  HardDrive,
  Database,
  Radio,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  Play,
  Settings2,
  Info,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  ChevronRight,
} from "lucide-react";

import api from "@/lib/api";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/components/ui/Toast";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Integration {
  service: string;
  status: string;
  config?: Record<string, unknown>;
  last_tested?: string;
  last_test_result?: string;
  last_test_response_ms?: number;
  last_test_error?: string;
  id?: string;
  updated_at?: string;
}

interface FieldDef {
  key: string;
  label: string;
  type: string;
  helper?: string;
  defaultValue?: string;
  readOnly?: boolean;
}

interface ServiceMeta {
  label: string;
  icon: React.ElementType;
  color: string;
  category: "required" | "storage" | "notification" | "optional" | "managed";
  fields: FieldDef[];
}

/* ------------------------------------------------------------------ */
/*  Service metadata (all 12 services)                                 */
/* ------------------------------------------------------------------ */

const SERVICE_META: Record<string, ServiceMeta> = {
  roboflow: {
    label: "Roboflow",
    icon: Cloud,
    color: "text-[#7C3AED]",
    category: "required",
    fields: [
      { key: "api_key", label: "API Key", type: "password", helper: "Your Roboflow private API key" },
      { key: "model_id", label: "Model ID", type: "text", helper: "e.g. wet-floor-detection/3" },
      { key: "api_url", label: "API URL", type: "text", helper: "Inference endpoint", defaultValue: "https://detect.roboflow.com" },
    ],
  },
  smtp: {
    label: "SMTP Email",
    icon: Mail,
    color: "text-[#2563EB]",
    category: "notification",
    fields: [
      { key: "host", label: "Host", type: "text", helper: "e.g. smtp.sendgrid.net or smtp.gmail.com" },
      { key: "port", label: "Port", type: "number", helper: "587 for TLS, 465 for SSL" },
      { key: "username", label: "Username", type: "text", helper: "For SendGrid use 'apikey' as username" },
      { key: "password", label: "Password", type: "password", helper: "SMTP password or API key" },
      { key: "from_email", label: "From Email", type: "text", helper: "Verified sender address" },
    ],
  },
  sms: {
    label: "SMS (Twilio)",
    icon: MessageSquare,
    color: "text-[#16A34A]",
    category: "notification",
    fields: [
      { key: "account_sid", label: "Account SID", type: "text", helper: "Starts with AC..." },
      { key: "auth_token", label: "Auth Token", type: "password", helper: "Found on Twilio console dashboard" },
      { key: "from_number", label: "From Number", type: "text", helper: "e.g. +15551234567" },
    ],
  },
  fcm: {
    label: "Firebase FCM",
    icon: Bell,
    color: "text-[#D97706]",
    category: "notification",
    fields: [
      { key: "credentials_json", label: "Service Account JSON", type: "textarea", helper: "Paste the entire JSON key file contents" },
    ],
  },
  s3: {
    label: "AWS S3",
    icon: HardDrive,
    color: "text-[#D97706]",
    category: "storage",
    fields: [
      { key: "endpoint_url", label: "Endpoint URL", type: "text", helper: "Leave blank for default AWS, or custom endpoint" },
      { key: "access_key_id", label: "Access Key ID", type: "text", helper: "IAM user access key" },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", helper: "IAM user secret key" },
      { key: "bucket_name", label: "Bucket Name", type: "text", helper: "Must already exist" },
      { key: "region", label: "Region", type: "text", helper: "e.g. us-east-1" },
    ],
  },
  minio: {
    label: "MinIO",
    icon: HardDrive,
    color: "text-[#0D9488]",
    category: "storage",
    fields: [
      { key: "endpoint_url", label: "Endpoint URL", type: "text", helper: "e.g. http://localhost:9000" },
      { key: "access_key_id", label: "Access Key", type: "text", helper: "MinIO root user or created access key" },
      { key: "secret_access_key", label: "Secret Key", type: "password", helper: "MinIO root password or secret key" },
      { key: "bucket_name", label: "Bucket Name", type: "text", helper: "Create via MinIO Console at :9001" },
    ],
  },
  r2: {
    label: "Cloudflare R2",
    icon: HardDrive,
    color: "text-[#2563EB]",
    category: "storage",
    fields: [
      { key: "endpoint_url", label: "Endpoint URL", type: "text", helper: "https://<account_id>.r2.cloudflarestorage.com" },
      { key: "access_key_id", label: "Access Key ID", type: "text", helper: "R2 API token access key" },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", helper: "R2 API token secret" },
      { key: "bucket_name", label: "Bucket Name", type: "text", helper: "Created in R2 dashboard" },
    ],
  },
  mqtt: {
    label: "MQTT",
    icon: Radio,
    color: "text-[#7C3AED]",
    category: "optional",
    fields: [
      { key: "host", label: "Host", type: "text", helper: "e.g. localhost or broker.hivemq.com" },
      { key: "port", label: "Port", type: "number", helper: "1883 (plain) or 8883 (TLS)" },
      { key: "username", label: "Username", type: "text", helper: "Optional for local brokers" },
      { key: "password", label: "Password", type: "password", helper: "Optional for local brokers" },
    ],
  },
  "cloudflare-tunnel": {
    label: "CF Tunnel",
    icon: Cloud,
    color: "text-[#2563EB]",
    category: "optional",
    fields: [
      { key: "account_id", label: "Account ID", type: "text", helper: "Cloudflare dashboard → Overview → Account ID" },
      { key: "api_token", label: "API Token", type: "password", helper: "Scoped to Tunnel:Edit permission" },
    ],
  },
  mongodb: {
    label: "MongoDB",
    icon: Database,
    color: "text-[#16A34A]",
    category: "managed",
    fields: [
      { key: "uri", label: "Connection URI", type: "password", helper: "Managed automatically by FloorEye", readOnly: true },
    ],
  },
  redis: {
    label: "Redis",
    icon: Database,
    color: "text-[#DC2626]",
    category: "managed",
    fields: [
      { key: "url", label: "Redis URL", type: "password", helper: "Managed automatically by FloorEye", readOnly: true },
    ],
  },
  webhook: {
    label: "Webhook",
    icon: Webhook,
    color: "text-[#D97706]",
    category: "notification",
    fields: [
      { key: "url", label: "Webhook URL", type: "text", helper: "HTTPS endpoint that receives POST requests" },
      { key: "secret", label: "Signing Secret", type: "password", helper: "Used to sign payloads (HMAC-SHA256)" },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Setup instructions per service                                     */
/* ------------------------------------------------------------------ */

const SETUP_INSTRUCTIONS: Record<string, { title: string; steps: string[] }> = {
  roboflow: {
    title: "Roboflow Setup",
    steps: [
      "Go to app.roboflow.com and sign in or create an account.",
      "Click your profile icon (top-right) → Settings → Roboflow API.",
      "Copy your Private API Key and paste it in the API Key field.",
      "Note your workspace slug from the URL (app.roboflow.com/<workspace>).",
      "Find your model under Deployments → copy the Model ID (e.g. wet-floor-detection/3).",
      "The default API URL is https://detect.roboflow.com — change only if using a dedicated server.",
    ],
  },
  smtp: {
    title: "SMTP Email Setup",
    steps: [
      "Option 1 — SendGrid: Host = smtp.sendgrid.net, Port = 587, Username = apikey, Password = your SendGrid API key.",
      "Option 2 — Gmail: Host = smtp.gmail.com, Port = 587. Generate an App Password at myaccount.google.com → Security → 2-Step Verification → App Passwords.",
      "Option 3 — Postmark: Host = smtp.postmarkapp.com, Port = 587, Username = your Postmark Server API Token (same for password).",
      "Set From Email to a verified sender address for your provider.",
      "Test the connection after saving to verify delivery.",
    ],
  },
  sms: {
    title: "Twilio SMS Setup",
    steps: [
      "Go to console.twilio.com and sign in.",
      "On the dashboard, copy your Account SID (starts with AC).",
      "Copy your Auth Token (click to reveal).",
      "Under Phone Numbers → Manage → Active Numbers, copy your Twilio phone number (include country code, e.g. +15551234567).",
      "For trial accounts, verify recipient numbers under Verified Caller IDs.",
    ],
  },
  fcm: {
    title: "Firebase Cloud Messaging Setup",
    steps: [
      "Go to console.firebase.google.com and select your project (or create one).",
      "Click the gear icon → Project Settings → Service Accounts tab.",
      "Click 'Generate new private key' → Confirm.",
      "A JSON file will download. Open it and copy the entire contents.",
      "Paste the full JSON into the Credentials JSON field.",
      "Make sure Cloud Messaging API (V1) is enabled in your project.",
    ],
  },
  s3: {
    title: "AWS S3 Setup",
    steps: [
      "Go to AWS Console → S3 → Create Bucket. Choose a region and note the bucket name.",
      "Go to IAM → Users → Create User. Attach the AmazonS3FullAccess policy (or a scoped policy for your bucket).",
      "Under the user's Security Credentials tab, create an Access Key (choose 'Application running outside AWS').",
      "Copy the Access Key ID and Secret Access Key (shown only once).",
      "Leave Endpoint URL blank for standard AWS S3. Fill in region (e.g. us-east-1).",
    ],
  },
  r2: {
    title: "Cloudflare R2 Setup",
    steps: [
      "Go to Cloudflare Dashboard → R2 → Create Bucket. Note the bucket name.",
      "Go to R2 → Manage R2 API Tokens → Create API Token.",
      "Select permissions: Object Read & Write. Scope to your bucket.",
      "Copy the Access Key ID and Secret Access Key.",
      "Set Endpoint URL to: https://<your_account_id>.r2.cloudflarestorage.com",
    ],
  },
  minio: {
    title: "MinIO Setup",
    steps: [
      "Start MinIO with Docker: docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ':9001'",
      "Open the MinIO Console at http://localhost:9001 (default credentials: minioadmin/minioadmin).",
      "Create a bucket via Buckets → Create Bucket.",
      "Create an access key via Access Keys → Create Access Key. Copy both keys.",
      "Set Endpoint URL to http://localhost:9000 (or your MinIO host).",
    ],
  },
  mqtt: {
    title: "MQTT Broker Setup",
    steps: [
      "Option 1 — Local Mosquitto: Install via 'apt install mosquitto' or Docker: docker run -p 1883:1883 eclipse-mosquitto",
      "For local Mosquitto: Host = localhost, Port = 1883. Username/password optional unless configured.",
      "Option 2 — HiveMQ Cloud: Sign up at hivemq.com/mqtt-cloud-broker. Create a cluster.",
      "For HiveMQ Cloud: Host = <cluster>.hivemq.cloud, Port = 8883. Create credentials in the cluster settings.",
      "Test by publishing a message to the flooreye/# topic.",
    ],
  },
  "cloudflare-tunnel": {
    title: "Cloudflare Tunnel Setup",
    steps: [
      "If you deployed FloorEye via Docker Compose, the tunnel is already configured.",
      "To get your Account ID: Cloudflare Dashboard → Overview → right sidebar → Account ID.",
      "To create an API Token: My Profile → API Tokens → Create Token → Custom Token.",
      "Token permissions needed: Account → Cloudflare Tunnel → Edit.",
      "The tunnel connector (cloudflared) runs as a sidecar container in the edge stack.",
    ],
  },
  mongodb: {
    title: "MongoDB",
    steps: [
      "MongoDB is managed automatically by FloorEye's Docker Compose stack.",
      "The connection URI is set via the MONGO_URI environment variable.",
      "No manual configuration is needed. The database is created on first startup.",
      "For production, consider MongoDB Atlas (atlas.mongodb.com) and set the URI in .env.",
    ],
  },
  redis: {
    title: "Redis",
    steps: [
      "Redis is managed automatically by FloorEye's Docker Compose stack.",
      "The connection URL is set via the REDIS_URL environment variable.",
      "No manual configuration is needed. Redis starts with the docker-compose stack.",
      "For production, consider Redis Cloud or AWS ElastiCache and set the URL in .env.",
    ],
  },
  webhook: {
    title: "Webhook Setup",
    steps: [
      "Webhooks are configured per notification rule in Settings → Notification Rules.",
      "Enter the HTTPS endpoint URL that will receive POST requests.",
      "Optionally set a Signing Secret — FloorEye will include an X-Signature header (HMAC-SHA256).",
      "The payload is JSON with detection event details (see API docs for schema).",
      "Your endpoint should return 2xx within 10 seconds to be considered successful.",
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Helper: service ordering                                           */
/* ------------------------------------------------------------------ */

const SERVICE_ORDER = [
  "roboflow",
  "s3",
  "minio",
  "r2",
  "smtp",
  "sms",
  "fcm",
  "webhook",
  "mqtt",
  "cloudflare-tunnel",
  "mongodb",
  "redis",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ApiManagerPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // UI state
  const [drawerService, setDrawerService] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [infoService, setInfoService] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [testingService, setTestingService] = useState<string | null>(null);

  /* ---- Queries ---- */

  const { data: integrations, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await api.get("/integrations");
      return res.data.data as Integration[];
    },
    refetchInterval: 60000,
  });

  /* ---- Derived state ---- */

  const integrationsMap = useMemo(() => {
    const map: Record<string, Integration> = {};
    for (const intg of integrations ?? []) {
      map[intg.service] = intg;
    }
    return map;
  }, [integrations]);

  const healthStats = useMemo(() => {
    const configured: string[] = [];
    const issues: string[] = [];
    for (const [svc, intg] of Object.entries(integrationsMap)) {
      if (intg.status === "active" || intg.status === "connected") {
        configured.push(svc);
      } else if (intg.status === "error") {
        issues.push(svc);
      }
    }
    const hasRoboflow = configured.includes("roboflow");
    const hasStorage = configured.some((s) => ["s3", "minio", "r2"].includes(s));
    const hasNotification = configured.some((s) => ["smtp", "sms", "fcm", "webhook"].includes(s));
    const minRequirementsMet = [hasRoboflow, hasStorage, hasNotification].filter(Boolean).length;
    return { configured, issues, hasRoboflow, hasStorage, hasNotification, minRequirementsMet };
  }, [integrationsMap]);

  /* ---- Mutations ---- */

  const saveMutation = useMutation({
    mutationFn: ({ service, config }: { service: string; config: Record<string, string> }) =>
      api.put(`/integrations/${service}`, { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setDrawerService(null);
      setFormError("");
      success("Integration saved & encrypted");
    },
    onError: (err: any) => {
      setFormError("Failed to save config");
      showError(err?.response?.data?.detail || "Failed to save config");
    },
  });

  const testMutation = useMutation({
    mutationFn: (service: string) => {
      setTestingService(service);
      return api.post(`/integrations/${service}/test`);
    },
    onSuccess: (_data, service) => {
      setTestingService(null);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      success(`${SERVICE_META[service]?.label ?? service} test passed`);
    },
    onError: (err: any, service) => {
      setTestingService(null);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      showError(err?.response?.data?.detail || `${SERVICE_META[service]?.label ?? service} test failed`);
    },
  });

  const testAllMutation = useMutation({
    mutationFn: () => api.post("/integrations/test-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      success("All integrations tested");
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      showError(err?.response?.data?.detail || "Test all failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (service: string) => api.delete(`/integrations/${service}`),
    onSuccess: (_data, service) => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      success(`${SERVICE_META[service]?.label ?? service} configuration reset`);
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Reset failed");
    },
  });

  const drawerTestMutation = useMutation({
    mutationFn: (service: string) => api.post(`/integrations/${service}/test`),
    onSuccess: (_data, service) => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      success(`${SERVICE_META[service]?.label ?? service} connection OK`);
    },
    onError: (err: any, service) => {
      showError(err?.response?.data?.detail || `${SERVICE_META[service]?.label ?? service} connection failed`);
    },
  });

  /* ---- Handlers ---- */

  async function openDrawer(service: string) {
    setDrawerService(service);
    setFormError("");
    setVisibleSecrets({});
    try {
      const res = await api.get(`/integrations/${service}`);
      const cfg = res.data?.data?.config ?? {};
      const filled: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg)) {
        filled[k] = typeof v === "string" ? v : String(v ?? "");
      }
      // Apply defaults for empty fields
      const meta = SERVICE_META[service];
      if (meta) {
        for (const field of meta.fields) {
          if (!filled[field.key] && field.defaultValue) {
            filled[field.key] = field.defaultValue;
          }
        }
      }
      setFormData(filled);
    } catch {
      // No existing config — apply defaults
      const meta = SERVICE_META[service];
      const defaults: Record<string, string> = {};
      if (meta) {
        for (const field of meta.fields) {
          if (field.defaultValue) defaults[field.key] = field.defaultValue;
        }
      }
      setFormData(defaults);
    }
  }

  function handleSave() {
    if (!drawerService) return;
    saveMutation.mutate({ service: drawerService, config: formData });
  }

  function toggleSecret(key: string) {
    setVisibleSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const meta = drawerService ? SERVICE_META[drawerService] : null;

  /* ---- Health banner ---- */

  function renderHealthBanner() {
    const total = healthStats.configured.length;
    const issueCount = healthStats.issues.length;

    if (total > 0 && issueCount === 0) {
      return (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3">
          <ShieldCheck size={18} className="text-[#16A34A]" />
          <span className="text-sm font-medium text-[#16A34A]">
            All integrations healthy — {total} service{total !== 1 ? "s" : ""} connected
          </span>
        </div>
      );
    }

    if (issueCount > 0) {
      return (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
          <AlertTriangle size={18} className="text-[#D97706]" />
          <span className="text-sm font-medium text-[#D97706]">
            {issueCount} integration{issueCount !== 1 ? "s" : ""} need attention
          </span>
        </div>
      );
    }

    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
        <Info size={18} className="text-[#2563EB]" />
        <span className="text-sm font-medium text-[#2563EB]">
          Configure your integrations to enable notifications, storage, and AI detection
        </span>
      </div>
    );
  }

  /* ---- Quick Setup Guide modal ---- */

  function renderSetupGuideModal() {
    if (!showSetupGuide) return null;

    const requirements = [
      { label: "AI Detection (Roboflow)", met: healthStats.hasRoboflow, desc: "Required for spill/wet floor detection" },
      { label: "Storage Provider (S3, MinIO, or R2)", met: healthStats.hasStorage, desc: "Required for clip and image storage" },
      { label: "Notification Channel (SMTP, SMS, FCM, or Webhook)", met: healthStats.hasNotification, desc: "Required for alerting staff" },
    ];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSetupGuide(false)}>
        <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-[#E7E5E0] px-6 py-4">
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-[#0D9488]" />
              <h2 className="text-lg font-semibold text-[#1C1917]">Quick Setup Guide</h2>
            </div>
            <button onClick={() => setShowSetupGuide(false)} className="text-[#78716C] hover:text-[#1C1917]">
              <X size={18} />
            </button>
          </div>

          <div className="px-6 py-4 space-y-5">
            {/* Progress */}
            <div className="rounded-lg bg-[#F8F7F4] p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-[#1C1917]">Minimum Requirements</span>
                <span className="text-sm font-semibold text-[#0D9488]">{healthStats.minRequirementsMet}/3 configured</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#E7E5E0]">
                <div
                  className="h-2 rounded-full bg-[#0D9488] transition-all"
                  style={{ width: `${(healthStats.minRequirementsMet / 3) * 100}%` }}
                />
              </div>
            </div>

            {/* Required */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#78716C]">Required</h3>
              <div className="space-y-2">
                {requirements.map((req) => (
                  <div key={req.label} className="flex items-start gap-3 rounded-lg border border-[#E7E5E0] p-3">
                    {req.met ? (
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#16A34A]" />
                    ) : (
                      <XCircle size={18} className="mt-0.5 shrink-0 text-[#DC2626]" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-[#1C1917]">{req.label}</p>
                      <p className="text-xs text-[#78716C]">{req.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#78716C]">Optional</h3>
              <div className="space-y-1 text-sm text-[#1C1917]">
                <p className="flex items-center gap-2"><ChevronRight size={14} className="text-[#78716C]" /> SMS (Twilio) — text message alerts</p>
                <p className="flex items-center gap-2"><ChevronRight size={14} className="text-[#78716C]" /> MQTT — IoT device integration</p>
                <p className="flex items-center gap-2"><ChevronRight size={14} className="text-[#78716C]" /> Cloudflare Tunnel — edge site access</p>
              </div>
            </div>

            {/* Auto-managed */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#78716C]">Auto-Managed</h3>
              <p className="text-sm text-[#78716C]">MongoDB and Redis are configured automatically via Docker Compose. No action needed.</p>
            </div>
          </div>

          <div className="border-t border-[#E7E5E0] px-6 py-3 flex justify-end">
            <button
              onClick={() => setShowSetupGuide(false)}
              className="rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Info modal ---- */

  function renderInfoModal() {
    if (!infoService) return null;
    const svc = SERVICE_META[infoService];
    const instructions = SETUP_INSTRUCTIONS[infoService];
    if (!svc || !instructions) return null;
    const Icon = svc.icon;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setInfoService(null)}>
        <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-[#E7E5E0] px-6 py-4">
            <div className="flex items-center gap-2">
              <Icon size={18} className={svc.color} />
              <h2 className="text-lg font-semibold text-[#1C1917]">{instructions.title}</h2>
            </div>
            <button onClick={() => setInfoService(null)} className="text-[#78716C] hover:text-[#1C1917]">
              <X size={18} />
            </button>
          </div>

          <div className="px-6 py-4">
            <ol className="space-y-3">
              {instructions.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-[#1C1917]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0FDFA] text-xs font-semibold text-[#0D9488]">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="border-t border-[#E7E5E0] px-6 py-3 flex justify-end gap-3">
            <button
              onClick={() => {
                setInfoService(null);
                openDrawer(infoService);
              }}
              className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
            >
              Configure Now
            </button>
            <button
              onClick={() => setInfoService(null)}
              className="rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Configure drawer ---- */

  function renderDrawer() {
    if (!drawerService || !meta) return null;
    const Icon = meta.icon;
    const isManaged = meta.category === "managed";
    const intg = integrationsMap[drawerService];
    const isConfigured = intg && intg.status !== "not_configured";

    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDrawerService(null)}>
        <div className="h-full w-[384px] overflow-y-auto bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
            <div className="flex items-center gap-2">
              <Icon size={18} className={meta.color} />
              <h2 className="text-lg font-semibold text-[#1C1917]">Configure {meta.label}</h2>
            </div>
            <button onClick={() => setDrawerService(null)} className="text-[#78716C] hover:text-[#1C1917]">
              <X size={18} />
            </button>
          </div>

          {/* Managed notice */}
          {isManaged && (
            <div className="mx-4 mt-4 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-xs text-[#2563EB]">
              This service is managed automatically by FloorEye. Changes are typically made via environment variables.
            </div>
          )}

          {/* Fields */}
          <div className="space-y-4 p-4">
            {meta.fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">{field.label}</label>
                {field.type === "textarea" ? (
                  <textarea
                    value={formData[field.key] ?? ""}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    rows={6}
                    readOnly={field.readOnly}
                    className={`w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm font-mono outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] ${field.readOnly ? "bg-[#F8F7F4] text-[#78716C]" : ""}`}
                  />
                ) : field.type === "password" ? (
                  <div className="relative">
                    <input
                      type={visibleSecrets[field.key] ? "text" : "password"}
                      value={formData[field.key] ?? ""}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      readOnly={field.readOnly}
                      className={`w-full rounded-md border border-[#E7E5E0] px-3 py-2 pr-10 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] ${field.readOnly ? "bg-[#F8F7F4] text-[#78716C]" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret(field.key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917]"
                      tabIndex={-1}
                    >
                      {visibleSecrets[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                ) : (
                  <input
                    type={field.type}
                    value={formData[field.key] ?? ""}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    readOnly={field.readOnly}
                    className={`w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] ${field.readOnly ? "bg-[#F8F7F4] text-[#78716C]" : ""}`}
                  />
                )}
                {field.helper && (
                  <p className="mt-1 text-xs text-[#78716C]">{field.helper}</p>
                )}
              </div>
            ))}

            {formError && (
              <div className="rounded-md bg-[#FEE2E2] px-3 py-2 text-sm text-[#DC2626]">{formError}</div>
            )}

            {/* Action buttons */}
            <div className="space-y-3 border-t border-[#E7E5E0] pt-4">
              <div className="flex gap-3">
                {!isManaged && (
                  <button
                    onClick={() => drawerTestMutation.mutate(drawerService)}
                    disabled={drawerTestMutation.isPending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50"
                  >
                    {drawerTestMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    Test Connection
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || isManaged}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
                >
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Save & Encrypt
                </button>
              </div>

              {/* Reset */}
              {isConfigured && !isManaged && (
                <button
                  onClick={() => {
                    if (confirm(`Reset ${meta.label} configuration? This cannot be undone.`)) {
                      deleteMutation.mutate(drawerService);
                      setDrawerService(null);
                    }
                  }}
                  className="w-full text-center text-xs text-[#DC2626] hover:underline"
                >
                  Reset Configuration
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Service cards ---- */

  function renderServiceCard(serviceKey: string) {
    const svc = SERVICE_META[serviceKey];
    if (!svc) return null;
    const intg = integrationsMap[serviceKey];
    const status = intg?.status ?? "not_configured";
    const Icon = svc.icon;
    const isTesting = testingService === serviceKey;

    return (
      <div key={serviceKey} className="rounded-lg border border-[#E7E5E0] bg-white p-4 transition-shadow hover:shadow-sm">
        {/* Top: icon + name + status */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-[#F8F7F4]`}>
              <Icon size={16} className={svc.color} />
            </div>
            <span className="text-sm font-medium text-[#1C1917]">{svc.label}</span>
          </div>
          <StatusBadge status={status} size="sm" />
        </div>

        {/* Last tested + latency */}
        <div className="mb-3 min-h-[20px]">
          {intg?.last_tested ? (
            <div className="flex items-center gap-1 text-[10px] text-[#78716C]">
              {intg.last_test_result === "success" && <CheckCircle2 size={10} className="text-[#16A34A]" />}
              {intg.last_test_result === "failure" && <XCircle size={10} className="text-[#DC2626]" />}
              <span>
                Tested {new Date(intg.last_tested).toLocaleString()}
                {intg.last_test_response_ms != null && ` \u00B7 ${intg.last_test_response_ms.toFixed(0)}ms`}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-[#78716C]">Not tested yet</span>
          )}
          {intg?.last_test_result === "failure" && intg?.last_test_error && (
            <p className="mt-0.5 truncate text-[10px] text-[#DC2626]" title={intg.last_test_error}>
              {intg.last_test_error}
            </p>
          )}
        </div>

        {/* Three buttons: Configure | Test | Info */}
        <div className="flex gap-2">
          <button
            onClick={() => openDrawer(serviceKey)}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[#E7E5E0] px-2 py-1.5 text-xs text-[#1C1917] hover:bg-[#F1F0ED]"
          >
            <Settings2 size={12} /> Configure
          </button>
          <button
            onClick={() => testMutation.mutate(serviceKey)}
            disabled={status === "not_configured" || isTesting || testMutation.isPending}
            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-[#0D9488] px-2 py-1.5 text-xs text-white hover:bg-[#0F766E] disabled:opacity-50"
          >
            {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Test
          </button>
          <button
            onClick={() => setInfoService(serviceKey)}
            className="flex items-center justify-center rounded-md border border-[#E7E5E0] px-2 py-1.5 text-xs text-[#78716C] hover:bg-[#F1F0ED] hover:text-[#1C1917]"
            title={`Setup instructions for ${svc.label}`}
          >
            <Info size={14} />
          </button>
        </div>
      </div>
    );
  }

  /* ---- Main render ---- */

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">API Integration Manager</h1>
          <p className="text-sm text-[#78716C]">Configure and test third-party service connections</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSetupGuide(true)}
            className="flex items-center gap-2 rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
          >
            <BookOpen size={14} />
            Setup Guide
            <span className="rounded-full bg-[#0D9488] px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {healthStats.minRequirementsMet}/3
            </span>
          </button>
          <button
            onClick={() => testAllMutation.mutate()}
            disabled={testAllMutation.isPending}
            className="flex items-center gap-2 rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50"
          >
            {testAllMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Test All
          </button>
        </div>
      </div>

      {/* Health banner */}
      {!isLoading && renderHealthBanner()}

      {/* Cards */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SERVICE_ORDER.map((key) => renderServiceCard(key))}
        </div>
      )}

      {/* Modals & Drawer */}
      {renderSetupGuideModal()}
      {renderInfoModal()}
      {renderDrawer()}
    </div>
  );
}
