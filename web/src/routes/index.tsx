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
import NotificationsPage from "@/pages/config/NotificationsPage";
import DevicesPage from "@/pages/config/DevicesPage";
import DatasetPage from "@/pages/ml/DatasetPage";
import ModelRegistryPage from "@/pages/ml/ModelRegistryPage";
import ClipsPage from "@/pages/clips/ClipsPage";
import LogsPage from "@/pages/admin/LogsPage";
import UsersPage from "@/pages/admin/UsersPage";
import RoboflowPage from "@/pages/integrations/RoboflowPage";
import RoboflowBrowserPage from "@/pages/integrations/RoboflowBrowserPage";
import StoragePage from "@/pages/config/StoragePage";
import TestInferencePage from "@/pages/ml/TestInferencePage";
import ClassManagerPage from "@/pages/detection-control/ClassManagerPage";
import ApiTesterPage from "@/pages/integrations/ApiTesterPage";
import ManualPage from "@/pages/admin/ManualPage";
import LearningDashboardPage from "@/pages/learning/LearningDashboardPage";
import LearningSettingsPage from "@/pages/learning/LearningSettingsPage";
import DatasetBrowserPage from "@/pages/learning/DatasetBrowserPage";
import TrainingJobsPage from "@/pages/learning/TrainingJobsPage";
import AnnotationStudioPage from "@/pages/learning/AnnotationStudioPage";
import ModelComparisonPage from "@/pages/learning/ModelComparisonPage";
import ModelTestingPage from "@/pages/learning/ModelTestingPage";
import CompliancePage from "@/pages/compliance/CompliancePage";
import MonitoringPage from "@/pages/monitoring/MonitoringPage";
import NotificationCenterPage from "@/pages/notifications/NotificationCenterPage";
import NotificationPreferencesPage from "@/pages/profile/NotificationPreferencesPage";

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
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/clips" element={<ClipsPage />} />
        <Route path="/compliance" element={<CompliancePage />} />

        {/* Detection & Review */}
        <Route path="/detection/history" element={<DetectionHistoryPage />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/incidents/:id" element={<IncidentsPage />} />
        {/* ML & Data */}
        <Route path="/dataset" element={<DatasetPage />} />
        <Route path="/models" element={<ModelRegistryPage />} />
        <Route path="/ml/test-inference" element={<TestInferencePage />} />

        {/* Configuration */}
        <Route path="/stores" element={<StoresPage />} />
        <Route path="/stores/:id" element={<StoreDetailPage />} />
        <Route path="/cameras" element={<CamerasPage />} />
        <Route path="/cameras/wizard" element={<CameraWizardPage />} />
        <Route path="/cameras/:id" element={<CameraDetailPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/notification-center" element={<NotificationCenterPage />} />
        <Route path="/profile/notification-preferences" element={<NotificationPreferencesPage />} />
        <Route path="/settings/storage" element={<StoragePage />} />

        {/* Detection Control */}
        <Route path="/detection-control" element={<DetectionControlPage />} />
        <Route path="/detection-control/classes" element={<ClassManagerPage />} />

        {/* Integrations */}
        <Route path="/integrations/api-manager" element={<ApiManagerPage />} />
        <Route path="/integrations/api-tester" element={<ApiTesterPage />} />
        <Route path="/integrations/roboflow" element={<RoboflowPage />} />
        <Route path="/integrations/roboflow/browse" element={<RoboflowBrowserPage />} />

        {/* Edge */}
        <Route path="/edge" element={<EdgeManagementPage />} />

        {/* Administration */}
        {/* Learning System */}
        <Route path="/learning" element={<LearningDashboardPage />} />
        <Route path="/learning/settings" element={<LearningSettingsPage />} />
        <Route path="/learning/dataset" element={<DatasetBrowserPage />} />
        <Route path="/learning/training" element={<TrainingJobsPage />} />
        <Route path="/learning/annotate" element={<AnnotationStudioPage />} />
        <Route path="/learning/models" element={<ModelComparisonPage />} />
        <Route path="/learning/test" element={<ModelTestingPage />} />

        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/logs" element={<LogsPage />} />
        <Route path="/docs" element={<ManualPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
