import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Box,
  Check,
  ChevronRight,
  Cloud,
  Download,
  Image,
  Layers,
  Loader2,
  RefreshCw,
  Tag,
  XCircle,
} from "lucide-react";

import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import StatusBadge from "@/components/shared/StatusBadge";

interface RoboflowProject {
  id: string;
  full_id: string;
  name: string;
  type: string;
  images: number;
  classes: Record<string, number>;
  class_count: number;
  versions: number;
  created: string;
  updated: string;
}

interface ModelMetrics {
  map: number | null;
  precision: number | null;
  recall: number | null;
  type: string;
  status: string;
}

interface RoboflowVersion {
  version: number;
  id: string;
  images: number;
  model: ModelMetrics | null;
  exports: string[];
  has_onnx: boolean;
  created: string;
}

export default function RoboflowBrowserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [selectedProject, setSelectedProject] = useState<RoboflowProject | null>(null);
  const [deployingVersion, setDeployingVersion] = useState<number | null>(null);

  // Current production model
  const { data: prodModelData } = useQuery({
    queryKey: ["production-model-browser"],
    queryFn: async () => {
      const res = await api.get("/models", { params: { status: "production", limit: 1 } });
      return res.data?.data?.[0] ?? null;
    },
  });
  const deployedVersion = prodModelData?.pulled_from?.split("/").pop();

  // Fetch workspace + projects
  const { data: workspace, isLoading: wsLoading, error: wsError, refetch: refetchWs } = useQuery({
    queryKey: ["roboflow-workspace"],
    queryFn: async () => {
      const res = await api.get("/roboflow/workspace");
      return res.data.data;
    },
  });

  // Fetch versions when a project is selected
  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ["roboflow-versions", selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject) return null;
      const res = await api.get(`/roboflow/projects/${selectedProject.id}/versions`);
      return res.data.data;
    },
    enabled: !!selectedProject,
  });

  // Select & deploy model
  const deployMutation = useMutation({
    mutationFn: async ({ projectId, version }: { projectId: string; version: number }) => {
      setDeployingVersion(version);
      const res = await api.post("/roboflow/select-model", {
        project_id: projectId,
        version,
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      setDeployingVersion(null);
      queryClient.invalidateQueries({ queryKey: ["models"] });
      queryClient.invalidateQueries({ queryKey: ["roboflow-workspace"] });
      success(
        `Model deployed! ${data.version_str} (${data.model_size_mb}MB) → ${data.deployed_to_agents} agents, ${data.classes_synced} classes synced`
      );
    },
    onError: (err: any) => {
      setDeployingVersion(null);
      showError(err?.response?.data?.detail || "Failed to deploy model");
    },
  });

  const projects: RoboflowProject[] = workspace?.projects || [];

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => navigate("/integrations/roboflow")}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Roboflow Model Browser</h1>
          <p className="mt-1 text-sm text-gray-500">
            {workspace?.workspace
              ? `Workspace: ${workspace.workspace} — ${projects.length} project${projects.length !== 1 ? "s" : ""}`
              : "Connect your Roboflow account to browse models"}
          </p>
        </div>
        <button
          onClick={() => refetchWs()}
          className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={16} className={wsLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Current deployment info */}
      {prodModelData && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-5 py-3">
          <Check size={18} className="text-teal-600" />
          <div>
            <span className="text-sm font-medium text-teal-900">Currently deployed: </span>
            <span className="text-sm text-teal-700">{prodModelData.version_str} ({prodModelData.model_size_mb} MB, {prodModelData.architecture})</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {wsLoading && (
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={28} className="animate-spin text-teal-600" />
          <span className="ml-3 text-sm text-gray-500">Connecting to Roboflow...</span>
        </div>
      )}

      {/* Error */}
      {wsError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <XCircle size={32} className="mx-auto mb-2 text-red-500" />
          <p className="text-sm font-medium text-red-800">Failed to connect to Roboflow</p>
          <p className="mt-1 text-xs text-red-600">
            {(wsError as any)?.response?.data?.detail || "Check your API key in Roboflow settings"}
          </p>
          <button
            onClick={() => navigate("/integrations/roboflow")}
            className="mt-3 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200"
          >
            Configure API Key
          </button>
        </div>
      )}

      {/* Empty workspace */}
      {!wsLoading && !wsError && projects.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <Cloud size={40} className="mx-auto mb-3 text-amber-500" />
          <p className="text-base font-medium text-amber-900">No projects in this workspace</p>
          <p className="mt-2 text-sm text-amber-700">
            Create a project in the Roboflow dashboard, upload images, and train a model. Then come back here to deploy it.
          </p>
        </div>
      )}

      {/* Project Grid */}
      {!wsLoading && !wsError && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => setSelectedProject(selectedProject?.id === project.id ? null : project)}
              className={`rounded-xl border p-5 text-left transition hover:shadow-md ${
                selectedProject?.id === project.id
                  ? "border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/20"
                  : "border-gray-200 bg-white hover:border-teal-300"
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <h3 className="text-base font-semibold text-gray-900">{project.name}</h3>
                <ChevronRight
                  size={18}
                  className={`text-gray-400 transition ${
                    selectedProject?.id === project.id ? "rotate-90 text-teal-600" : ""
                  }`}
                />
              </div>
              <div className="mb-3">
                <StatusBadge status={project.type || "unknown"} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="flex items-center justify-center gap-1 text-gray-400">
                    <Image size={12} />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{project.images}</p>
                  <p className="text-[10px] text-gray-500">Images</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="flex items-center justify-center gap-1 text-gray-400">
                    <Tag size={12} />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{project.class_count}</p>
                  <p className="text-[10px] text-gray-500">Classes</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="flex items-center justify-center gap-1 text-gray-400">
                    <Layers size={12} />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{project.versions}</p>
                  <p className="text-[10px] text-gray-500">Versions</p>
                </div>
              </div>
              {project.class_count > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {Object.keys(project.classes)
                    .slice(0, 5)
                    .map((cls) => (
                      <span
                        key={cls}
                        className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800"
                      >
                        {cls}
                      </span>
                    ))}
                  {project.class_count > 5 && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                      +{project.class_count - 5}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Version Table (shown when a project is selected) */}
      {selectedProject && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Versions — {selectedProject.name}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Select a trained version to deploy to your edge agents
            </p>
          </div>

          {versionsLoading && (
            <div className="flex h-32 items-center justify-center">
              <Loader2 size={24} className="animate-spin text-teal-600" />
            </div>
          )}

          {!versionsLoading && versions && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-3">Version</th>
                    <th className="px-6 py-3">mAP@50</th>
                    <th className="px-6 py-3">Precision</th>
                    <th className="px-6 py-3">Recall</th>
                    <th className="px-6 py-3">Model Type</th>
                    <th className="px-6 py-3">Images</th>
                    <th className="px-6 py-3">ONNX</th>
                    <th className="px-6 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.versions?.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                        No trained versions yet. Train a model in Roboflow first.
                      </td>
                    </tr>
                  )}
                  {versions.versions?.map((v: RoboflowVersion) => {
                    const isDeploying = deployingVersion === v.version;
                    const hasTrained = v.model && (v.model.status === "finished" || Number(v.model.map) > 0);
                    const canDeploy = hasTrained;

                    return (
                      <tr
                        key={v.version}
                        className="border-b border-gray-50 hover:bg-gray-50/50"
                      >
                        <td className="px-6 py-3.5">
                          <span className="font-semibold text-gray-900">v{v.version}</span>
                          {String(v.version) === String(deployedVersion) && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
                              <Check size={10} /> Deployed
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {v.model?.map != null && Number(v.model.map) > 0 ? (
                            <span className="font-medium text-gray-900">
                              {Number(v.model.map) > 1 ? `${Number(v.model.map).toFixed(1)}%` : `${(Number(v.model.map) * 100).toFixed(1)}%`}
                            </span>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {v.model?.precision != null && Number(v.model.precision) > 0 ? (
                            <span className="text-gray-700">
                              {Number(v.model.precision) > 1 ? `${Number(v.model.precision).toFixed(1)}%` : `${(Number(v.model.precision) * 100).toFixed(1)}%`}
                            </span>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {v.model?.recall != null && Number(v.model.recall) > 0 ? (
                            <span className="text-gray-700">
                              {Number(v.model.recall) > 1 ? `${Number(v.model.recall).toFixed(1)}%` : `${(Number(v.model.recall) * 100).toFixed(1)}%`}
                            </span>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="text-xs text-gray-600">
                            {v.model?.type || "Not trained"}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-sm text-gray-600">{v.images}</td>
                        <td className="px-6 py-3.5">
                          {v.has_onnx ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              <Check size={12} /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                              <XCircle size={12} /> Not exported
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {canDeploy ? (
                            <button
                              onClick={() =>
                                deployMutation.mutate({
                                  projectId: selectedProject.id,
                                  version: v.version,
                                })
                              }
                              disabled={isDeploying || deployMutation.isPending}
                              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              {isDeploying ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  Deploying...
                                </>
                              ) : (
                                <>
                                  <Download size={14} />
                                  Use This Model
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">
                              {v.model ? "Training..." : "No model"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Deploy status */}
      {deployMutation.isSuccess && deployMutation.data && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <Check size={20} className="text-green-600" />
            <span className="font-medium text-green-900">Model Deployed Successfully</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-green-700">Version:</span>{" "}
              <span className="font-medium">{deployMutation.data.version_str}</span>
            </div>
            <div>
              <span className="text-green-700">Size:</span>{" "}
              <span className="font-medium">{deployMutation.data.model_size_mb} MB</span>
            </div>
            <div>
              <span className="text-green-700">Classes:</span>{" "}
              <span className="font-medium">{deployMutation.data.classes_synced}</span>
            </div>
            <div>
              <span className="text-green-700">Agents:</span>{" "}
              <span className="font-medium">{deployMutation.data.deployed_to_agents}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
