import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import StoresPage from "@/pages/stores/StoresPage";
import StoreDetailPage from "@/pages/stores/StoreDetailPage";
import CamerasPage from "@/pages/cameras/CamerasPage";
import CameraDetailPage from "@/pages/cameras/CameraDetailPage";
import CameraWizardPage from "@/pages/cameras/CameraWizardPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import DetectionHistoryPage from "@/pages/detection/DetectionHistoryPage";
import IncidentsPage from "@/pages/detection/IncidentsPage";
import DetectionControlPage from "@/pages/detection-control/DetectionControlPage";
import ApiManagerPage from "@/pages/integrations/ApiManagerPage";
import EdgeManagementPage from "@/pages/edge/EdgeManagementPage";

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
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPasswordPage />
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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/monitoring" element={<Placeholder title="Live Monitoring" />} />
        <Route path="/clips" element={<Placeholder title="Recorded Clips" />} />

        {/* Detection & Review */}
        <Route path="/detection/history" element={<DetectionHistoryPage />} />
        <Route path="/incidents" element={<IncidentsPage />} />
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
        <Route path="/stores" element={<StoresPage />} />
        <Route path="/stores/:id" element={<StoreDetailPage />} />
        <Route path="/cameras" element={<CamerasPage />} />
        <Route path="/cameras/wizard" element={<CameraWizardPage />} />
        <Route path="/cameras/:id" element={<CameraDetailPage />} />
        <Route path="/devices" element={<Placeholder title="Device Control" />} />
        <Route path="/notifications" element={<Placeholder title="Notification Settings" />} />
        <Route path="/settings/storage" element={<Placeholder title="Storage Settings" />} />

        {/* Detection Control */}
        <Route path="/detection-control" element={<DetectionControlPage />} />
        <Route path="/detection-control/classes" element={<Placeholder title="Class Manager" />} />

        {/* Integrations */}
        <Route path="/integrations/api-manager" element={<ApiManagerPage />} />
        <Route path="/integrations/api-tester" element={<Placeholder title="API Testing Console" />} />
        <Route path="/integrations/roboflow" element={<Placeholder title="Roboflow Integration" />} />

        {/* Edge */}
        <Route path="/edge" element={<EdgeManagementPage />} />

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
