import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";

// Placeholder for pages not yet implemented
function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
      <p className="text-sm text-[#78716C]">{title} — coming soon</p>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8F7F4]">
        <Loader2 size={32} className="animate-spin text-[#0D9488]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8F7F4]">
        <Loader2 size={32} className="animate-spin text-[#0D9488]" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function AppRoutes() {
  const { user, logout } = useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <Placeholder title="Forgot Password" />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <Placeholder title="Reset Password" />
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            {user && <AppLayout user={user} onLogout={logout} />}
          </ProtectedRoute>
        }
      >
        {/* Monitoring */}
        <Route path="/dashboard" element={<Placeholder title="Dashboard" />} />
        <Route path="/monitoring" element={<Placeholder title="Live Monitoring" />} />
        <Route path="/clips" element={<Placeholder title="Recorded Clips" />} />

        {/* Detection & Review */}
        <Route path="/detection/history" element={<Placeholder title="Detection History" />} />
        <Route path="/incidents" element={<Placeholder title="Incident Management" />} />
        <Route path="/review" element={<Placeholder title="Review Queue" />} />

        {/* ML & Training */}
        <Route path="/dataset" element={<Placeholder title="Dataset Management" />} />
        <Route path="/dataset/annotate/:id" element={<Placeholder title="Annotation Tool" />} />
        <Route path="/dataset/auto-label" element={<Placeholder title="Auto-Labeling" />} />
        <Route path="/training/explorer" element={<Placeholder title="Training Data Explorer" />} />
        <Route path="/training/jobs" element={<Placeholder title="Distillation Jobs" />} />
        <Route path="/models" element={<Placeholder title="Model Registry" />} />
        <Route path="/ml/test-inference" element={<Placeholder title="Test Inference" />} />

        {/* Configuration */}
        <Route path="/stores" element={<Placeholder title="Stores" />} />
        <Route path="/stores/:id" element={<Placeholder title="Store Detail" />} />
        <Route path="/cameras" element={<Placeholder title="Cameras" />} />
        <Route path="/cameras/:id" element={<Placeholder title="Camera Detail" />} />
        <Route path="/cameras/wizard" element={<Placeholder title="Camera Wizard" />} />
        <Route path="/devices" element={<Placeholder title="Device Control" />} />
        <Route path="/notifications" element={<Placeholder title="Notification Settings" />} />
        <Route path="/settings/storage" element={<Placeholder title="Storage Settings" />} />

        {/* Detection Control */}
        <Route path="/detection-control" element={<Placeholder title="Detection Control Center" />} />
        <Route path="/detection-control/classes" element={<Placeholder title="Class Manager" />} />

        {/* Integrations */}
        <Route path="/integrations/api-manager" element={<Placeholder title="API Integration Manager" />} />
        <Route path="/integrations/api-tester" element={<Placeholder title="API Testing Console" />} />
        <Route path="/integrations/roboflow" element={<Placeholder title="Roboflow Integration" />} />

        {/* Edge */}
        <Route path="/edge" element={<Placeholder title="Edge Agents" />} />

        {/* Administration */}
        <Route path="/admin/users" element={<Placeholder title="User Management" />} />
        <Route path="/admin/logs" element={<Placeholder title="System Logs & Audit" />} />
        <Route path="/docs" element={<Placeholder title="User Manual" />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
