import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Filter, Loader2, Image as ImageIcon, Eye, Trash2, Tag, Download, Upload } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  FRAME_SOURCE_OPTIONS, LABEL_STATUS_OPTIONS, SPLIT_OPTIONS, VERDICT_OPTIONS,
  DEFAULT_PAGE_LIMIT,
} from "@/constants/learning";

interface LearningFrame {
  id: string;
  source: string;
  label_status: string;
  admin_verdict: string | null;
  split: string;
  annotations: { class_name: string; confidence: number }[];
  frame_url?: string;
  store_id?: string;
  camera_id?: string;
  captured_at: string;
  ingested_at: string;
  tags: string[];
}

export default function DatasetBrowserPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [source, setSource] = useState("");
  const [labelStatus, setLabelStatus] = useState("");
  const [split, setSplit] = useState("");
  const [verdict, setVerdict] = useState("");
  const [className, setClassName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<LearningFrame | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = DEFAULT_PAGE_LIMIT;

  const { data, isLoading } = useQuery({
    queryKey: ["learning-frames", source, labelStatus, split, verdict, className, dateFrom, dateTo, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit, offset: page * limit };
      if (source) params.source = source;
      if (labelStatus) params.label_status = labelStatus;
      if (split) params.split = split;
      if (verdict) params.admin_verdict = verdict;
      if (className) params.class_name = className;
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) params.date_to = new Date(dateTo + "T23:59:59").toISOString();
      const res = await api.get("/learning/frames", { params });
      return res.data as { data: LearningFrame[]; meta: { total: number } };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.delete(`/learning/frames/${id}`);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["learning-frames"] }); success("Deleted"); setSelected(new Set()); },
    onError: () => showError("Delete failed"),
  });

  const bulkSplitMutation = useMutation({
    mutationFn: async (newSplit: string) => {
      for (const id of selected) await api.put(`/learning/frames/${id}`, { split: newSplit });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["learning-frames"] }); success("Split updated"); setSelected(new Set()); },
    onError: () => showError("Update failed"),
  });

  const exportMutation = useMutation({
    mutationFn: async (format: "yolo" | "coco") => {
      const res = await api.post(`/learning/export/${format}`, {});
      return { data: res.data.data, format };
    },
    onSuccess: ({ data: exportData, format }) => {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flooreye_dataset_${format}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success(`Exported ${format.toUpperCase()} format`);
    },
    onError: () => showError("Export failed"),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/learning/frames/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-frames"] });
      success("Frame uploaded");
      setShowUpload(false);
    },
    onError: () => showError("Upload failed"),
  });

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadMutation.mutate(file);
  }, [uploadMutation]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  }, [uploadMutation]);

  const frames = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === frames.length) setSelected(new Set());
    else setSelected(new Set(frames.map((f) => f.id)));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dataset Browser</h1>
          <p className="mt-1 text-sm text-gray-500">{total.toLocaleString()} frames captured</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportMutation.mutate("yolo")}
            disabled={exportMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
          >
            <Download size={14} /> Export YOLO
          </button>
          <button
            onClick={() => exportMutation.mutate("coco")}
            disabled={exportMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
          >
            <Download size={14} /> Export COCO
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-teal-700"
          >
            <Upload size={14} /> Upload
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { value: source, onChange: setSource, options: FRAME_SOURCE_OPTIONS },
          { value: labelStatus, onChange: setLabelStatus, options: LABEL_STATUS_OPTIONS },
          { value: split, onChange: setSplit, options: SPLIT_OPTIONS },
          { value: verdict, onChange: setVerdict, options: VERDICT_OPTIONS },
        ].map((f, i) => (
          <select key={i} value={f.value} onChange={(e) => { f.onChange(e.target.value); setPage(0); }}
            className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:border-teal-500 focus:outline-none">
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <input
          type="text" placeholder="Search class..." value={className}
          onChange={(e) => { setClassName(e.target.value); setPage(0); }}
          className="h-9 w-32 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:border-teal-500 focus:outline-none"
        />
        <input
          type="date" value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
          className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:border-teal-500 focus:outline-none"
          title="From date"
        />
        <input
          type="date" value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
          className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:border-teal-500 focus:outline-none"
          title="To date"
        />
        {(source || labelStatus || split || verdict || className || dateFrom || dateTo) && (
          <button onClick={() => { setSource(""); setLabelStatus(""); setSplit(""); setVerdict(""); setClassName(""); setDateFrom(""); setDateTo(""); setPage(0); }}
            className="text-xs font-medium text-teal-600 hover:underline">Clear</button>
        )}
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-teal-50 px-4 py-2">
          <span className="text-xs font-medium text-teal-700">{selected.size} selected</span>
          <button onClick={() => bulkSplitMutation.mutate("train")} className="rounded bg-teal-600 px-2 py-1 text-xs text-white hover:bg-teal-700">→ Train</button>
          <button onClick={() => bulkSplitMutation.mutate("val")} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">→ Val</button>
          <button onClick={() => bulkSplitMutation.mutate("test")} className="rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700">→ Test</button>
          <button onClick={() => deleteMutation.mutate([...selected])} className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"><Trash2 size={12} /></button>
        </div>
      )}

      {/* Gallery */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-teal-600" /></div>
      ) : frames.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
          <ImageIcon size={32} className="mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No frames match your filters</p>
          <p className="text-xs text-gray-400">Start capturing data via detections or Roboflow imports</p>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <input type="checkbox" checked={selected.size === frames.length && frames.length > 0} onChange={selectAll}
              className="h-4 w-4 rounded border-gray-300 accent-teal-600" />
            <span className="text-xs text-gray-500">Select all on page</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {frames.map((f) => (
              <div key={f.id} className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-white shadow-sm transition hover:shadow-md ${selected.has(f.id) ? "border-teal-500 ring-2 ring-teal-200" : "border-gray-200"}`}>
                <div className="absolute left-2 top-2 z-10">
                  <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)}
                    className="h-4 w-4 rounded border-gray-300 accent-teal-600" onClick={(e) => e.stopPropagation()} />
                </div>
                <div onClick={() => setDetail(f)} className="aspect-video bg-gray-100">
                  {f.frame_url ? (
                    <img src={f.frame_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300"><ImageIcon size={24} /></div>
                  )}
                </div>
                <div className="p-2">
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className={`rounded-full px-1.5 py-0.5 font-medium ${
                      f.split === "train" ? "bg-teal-50 text-teal-700" :
                      f.split === "val" ? "bg-blue-50 text-blue-700" :
                      f.split === "test" ? "bg-purple-50 text-purple-700" :
                      "bg-gray-50 text-gray-500"
                    }`}>{f.split}</span>
                    {f.admin_verdict === "true_positive" && <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-green-700">TP</span>}
                    {f.admin_verdict === "false_positive" && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-red-700">FP</span>}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-gray-400">
                    {f.annotations?.length ?? 0} annotation{(f.annotations?.length ?? 0) !== 1 ? "s" : ""} · {f.source?.replace("_", " ")}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">Prev</button>
              <span className="text-xs text-gray-500">Page {page + 1} of {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetail(null)}>
          <div className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              {detail.frame_url && <img src={detail.frame_url} alt="" className="mb-4 w-full rounded-lg bg-gray-900 object-contain" style={{ maxHeight: 400 }} />}
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-gray-500">Source</dt><dd className="font-medium">{detail.source}</dd></div>
                <div><dt className="text-gray-500">Split</dt><dd className="font-medium">{detail.split}</dd></div>
                <div><dt className="text-gray-500">Label Status</dt><dd className="font-medium">{detail.label_status}</dd></div>
                <div><dt className="text-gray-500">Admin Verdict</dt><dd className="font-medium">{detail.admin_verdict ?? "—"}</dd></div>
                <div><dt className="text-gray-500">Captured</dt><dd className="font-medium">{new Date(detail.captured_at).toLocaleString()}</dd></div>
                <div><dt className="text-gray-500">Annotations</dt><dd className="font-medium">{detail.annotations?.length ?? 0}</dd></div>
              </dl>
              {detail.annotations?.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-1 text-xs font-semibold text-gray-500">Annotations</h4>
                  <div className="space-y-1">
                    {detail.annotations.map((a, i) => (
                      <div key={i} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs">
                        <span className="font-medium">{a.class_name}</span>
                        <span className="text-gray-500">{(a.confidence * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setDetail(null)} className="mt-4 w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowUpload(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-gray-900">Upload Frame</h3>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              className={`flex h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition ${
                dragOver ? "border-teal-500 bg-teal-50" : "border-gray-300 bg-gray-50 hover:border-teal-400"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadMutation.isPending ? (
                <Loader2 size={24} className="animate-spin text-teal-600" />
              ) : (
                <>
                  <Upload size={28} className="mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">Drag & drop an image here</p>
                  <p className="text-xs text-gray-400">or click to browse (JPEG, PNG, WebP)</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => setShowUpload(false)}
              className="mt-4 w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
