import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  Trash2,
  Loader2,
  Download,
  Upload,
  FolderPlus,
  FolderOpen,
  Folder,
  Image as ImageIcon,
  Check,
  X,
  Move,
  ChevronRight,
  Cloud,
} from "lucide-react";

import api from "@/lib/api";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface Frame {
  id: string;
  frame_path: string | null;
  frame_url: string | null;
  thumbnail_url: string | null;
  label_class: string | null;
  label_source: string | null;
  split: string | null;
  folder_id: string | null;
  roboflow_sync_status: string | null;
  created_at: string;
}

interface FolderType {
  id: string;
  name: string;
  description: string | null;
  parent_folder_id: string | null;
  frame_count: number;
}

const SPLITS = ["train", "val", "test", "unassigned"] as const;

export default function DatasetPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [splitFilter, setSplitFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selectedFrames, setSelectedFrames] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [previewFrame, setPreviewFrame] = useState<Frame | null>(null);
  const [page, setPage] = useState(0);

  // Queries
  const { data: foldersData } = useQuery({
    queryKey: ["dataset-folders"],
    queryFn: async () => (await api.get("/dataset/folders")).data.data as FolderType[],
  });

  const { data: framesData, isLoading } = useQuery({
    queryKey: ["dataset-frames", page, splitFilter, sourceFilter, selectedFolder],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 24, offset: page * 24 };
      if (splitFilter) params.split = splitFilter;
      if (sourceFilter) params.label_source = sourceFilter;
      if (selectedFolder) params.folder_id = selectedFolder;
      return (await api.get("/dataset/frames", { params })).data;
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ["dataset-stats"],
    queryFn: async () => (await api.get("/dataset/stats")).data.data,
  });

  const folders = foldersData ?? [];
  const frames: Frame[] = framesData?.data ?? [];
  const total = framesData?.meta?.total ?? 0;

  // Mutations
  const createFolderMut = useMutation({
    mutationFn: async () => {
      await api.post("/dataset/folders", { name: newFolderName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-folders"] });
      setNewFolderOpen(false);
      setNewFolderName("");
      success("Folder created");
    },
    onError: () => showError("Failed to create folder"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/dataset/frames/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-frames"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-folders"] });
      setDeleteTarget(null);
      success("Frame deleted");
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async () => {
      await api.post("/dataset/frames/bulk-delete", { frame_ids: [...selectedFrames] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-frames"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-folders"] });
      setSelectedFrames(new Set());
      success("Frames deleted");
    },
  });

  const moveMut = useMutation({
    mutationFn: async (folderId: string | null) => {
      await api.post("/dataset/frames/move", { frame_ids: [...selectedFrames], folder_id: folderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-frames"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-folders"] });
      setSelectedFrames(new Set());
      success("Frames moved");
    },
  });

  const splitMut = useMutation({
    mutationFn: async (split: string) => {
      await api.post("/dataset/frames/bulk-split", { frame_ids: [...selectedFrames], split });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-frames"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-stats"] });
      setSelectedFrames(new Set());
      success("Split updated");
    },
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const params: Record<string, string> = {};
      if (selectedFolder) params.folder_id = selectedFolder;
      await api.post("/dataset/upload", form, { params, headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-frames"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-folders"] });
      success("Frame uploaded");
    },
    onError: () => showError("Upload failed"),
  });

  const rfUploadMut = useMutation({
    mutationFn: async () => {
      const ids = selectedFrames.size > 0 ? [...selectedFrames] : undefined;
      await api.post("/dataset/upload-to-roboflow", {
        frame_ids: ids,
        folder_id: ids ? undefined : selectedFolder,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-frames"] });
      success("Roboflow upload queued");
    },
  });

  const deleteFolderMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/dataset/folders/${id}?delete_frames=false`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-folders"] });
      queryClient.invalidateQueries({ queryKey: ["dataset-frames"] });
      setSelectedFolder(null);
      success("Folder deleted");
    },
  });

  function toggleFrame(id: string) {
    setSelectedFrames((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedFrames.size === frames.length) {
      setSelectedFrames(new Set());
    } else {
      setSelectedFrames(new Set(frames.map((f) => f.id)));
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) {
      for (const file of files) {
        uploadMut.mutate(file);
      }
    }
    e.target.value = "";
  }

  const splitStats = statsData?.by_split ?? {};

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dataset Manager</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} frame{total !== 1 ? "s" : ""} · {Object.entries(splitStats).map(([k, v]) => `${k}: ${v}`).join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setNewFolderOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <FolderPlus size={14} /> New Folder
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700">
            <Upload size={14} /> Upload
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
          <button onClick={() => window.open(`/api/v1/dataset/export/coco${splitFilter ? `?split=${splitFilter}` : ""}`, "_blank")} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <Download size={14} /> COCO
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Sidebar — Folders */}
        <div className="w-52 shrink-0">
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold text-gray-400 uppercase">Folders</p>
            <button onClick={() => { setSelectedFolder(null); setPage(0); }} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${!selectedFolder ? "bg-teal-50 text-teal-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
              <Database size={13} /> All ({statsData?.total_frames ?? 0})
            </button>
            <button onClick={() => { setSelectedFolder("uncategorized"); setPage(0); }} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${selectedFolder === "uncategorized" ? "bg-teal-50 text-teal-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
              <FolderOpen size={13} /> Uncategorized
            </button>
            {folders.map((f) => (
              <div key={f.id} className="group flex items-center">
                <button onClick={() => { setSelectedFolder(f.id); setPage(0); }} className={`flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${selectedFolder === f.id ? "bg-teal-50 text-teal-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
                  <Folder size={13} /> <span className="truncate">{f.name}</span>
                  <span className="ml-auto text-[10px] text-gray-400">{f.frame_count}</span>
                </button>
                <button onClick={() => deleteFolderMut.mutate(f.id)} className="hidden rounded p-0.5 text-gray-400 hover:text-red-500 group-hover:block" title="Delete folder">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main — Frame Grid */}
        <div className="flex-1">
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select value={splitFilter} onChange={(e) => { setSplitFilter(e.target.value); setPage(0); }} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700">
              <option value="">All Splits</option>
              {SPLITS.map((s) => <option key={s} value={s}>{s} ({splitStats[s] ?? 0})</option>)}
            </select>
            <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700">
              <option value="">All Sources</option>
              <option value="manual_upload">Manual Upload</option>
              <option value="clip_extraction">Clip Extraction</option>
              <option value="auto_detection">Auto Detection</option>
              <option value="teacher_roboflow">Roboflow</option>
              <option value="human_validated">Human Validated</option>
            </select>
            {selectedFrames.size > 0 && (
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs text-gray-500">{selectedFrames.size} selected</span>
                <select onChange={(e) => { if (e.target.value) moveMut.mutate(e.target.value === "uncategorized" ? null : e.target.value); e.target.value = ""; }} className="rounded-lg border border-gray-200 px-2 py-1 text-[10px]">
                  <option value="">Move to...</option>
                  <option value="uncategorized">Uncategorized</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <select onChange={(e) => { if (e.target.value) splitMut.mutate(e.target.value); e.target.value = ""; }} className="rounded-lg border border-gray-200 px-2 py-1 text-[10px]">
                  <option value="">Split...</option>
                  {SPLITS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => rfUploadMut.mutate()} className="flex items-center gap-1 rounded-lg border border-teal-200 px-2 py-1 text-[10px] text-teal-700 hover:bg-teal-50">
                  <Cloud size={10} /> Roboflow
                </button>
                <button onClick={() => bulkDeleteMut.mutate()} className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50">
                  <Trash2 size={10} /> Delete
                </button>
              </div>
            )}
          </div>

          {/* Select all */}
          {frames.length > 0 && (
            <div className="mb-2 flex items-center gap-2">
              <input type="checkbox" checked={selectedFrames.size === frames.length && frames.length > 0} onChange={toggleAll} className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600" />
              <span className="text-[10px] text-gray-400">Select all</span>
            </div>
          )}

          {/* Grid */}
          {isLoading ? (
            <div className="flex h-48 items-center justify-center"><Loader2 size={24} className="animate-spin text-teal-600" /></div>
          ) : frames.length === 0 ? (
            <EmptyState icon={ImageIcon} title="No frames" description={selectedFolder ? "This folder is empty. Upload frames or move them here." : "Upload frames to start building your dataset."} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {frames.map((f) => (
                <div key={f.id} className={`group relative overflow-hidden rounded-xl border-2 transition ${selectedFrames.has(f.id) ? "border-teal-500 ring-2 ring-teal-500/20" : "border-gray-200 hover:border-gray-300"}`}>
                  {/* Checkbox */}
                  <div className="absolute left-1.5 top-1.5 z-10">
                    <input type="checkbox" checked={selectedFrames.has(f.id)} onChange={() => toggleFrame(f.id)} className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600" />
                  </div>
                  {/* Image */}
                  <div className="aspect-video cursor-pointer bg-gray-100" onClick={() => setPreviewFrame(f)}>
                    {(f.frame_url || f.thumbnail_url) ? (
                      <img src={f.thumbnail_url || f.frame_url || ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-300"><ImageIcon size={24} /></div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-1.5">
                    <div className="flex flex-wrap gap-1">
                      {f.split && f.split !== "unassigned" && (
                        <span className={`rounded px-1 py-0.5 text-[8px] font-bold ${f.split === "train" ? "bg-blue-100 text-blue-700" : f.split === "val" ? "bg-amber-100 text-amber-700" : "bg-purple-100 text-purple-700"}`}>
                          {f.split}
                        </span>
                      )}
                      {f.label_class && (
                        <span className="rounded bg-green-100 px-1 py-0.5 text-[8px] text-green-700">{f.label_class}</span>
                      )}
                      {f.roboflow_sync_status === "synced" && (
                        <span className="rounded bg-teal-100 px-1 py-0.5 text-[8px] text-teal-700"><Check size={8} className="inline" /> RF</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > 24 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">&lt; Prev</button>
              <span className="text-xs text-gray-500">Page {page + 1} of {Math.ceil(total / 24)}</span>
              <button onClick={() => setPage(page + 1)} disabled={(page + 1) * 24 >= total} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-30">Next &gt;</button>
            </div>
          )}
        </div>
      </div>

      {/* New Folder Modal */}
      {newFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-80 rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">New Folder</h3>
            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name..." autoFocus className="mb-4 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500" onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && createFolderMut.mutate()} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setNewFolderOpen(false)} className="rounded-lg border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => createFolderMut.mutate()} disabled={!newFolderName.trim()} className="rounded-lg bg-teal-600 px-4 py-2 text-xs text-white hover:bg-teal-700 disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFrame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setPreviewFrame(null)}>
          <div className="relative max-h-[90vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewFrame(null)} className="absolute -right-2 -top-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X size={20} /></button>
            {previewFrame.frame_url ? (
              <img src={previewFrame.frame_url} alt="Frame preview" className="max-h-[85vh] rounded-xl" />
            ) : (
              <div className="flex h-64 w-96 items-center justify-center rounded-xl bg-gray-800 text-gray-500">No preview available</div>
            )}
            <div className="mt-2 flex justify-center gap-2 text-xs text-gray-400">
              {previewFrame.split && <span className="rounded bg-gray-700 px-2 py-0.5">{previewFrame.split}</span>}
              {previewFrame.label_class && <span className="rounded bg-gray-700 px-2 py-0.5">{previewFrame.label_class}</span>}
              {previewFrame.label_source && <span className="rounded bg-gray-700 px-2 py-0.5">{previewFrame.label_source}</span>}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} title="Delete Frame" description="Delete this frame permanently?" confirmLabel="Delete" destructive onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget)} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
