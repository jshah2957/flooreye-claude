import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Filter, Loader2, Image as ImageIcon, Eye, Trash2, Tag } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

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

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "edge_detection", label: "Edge Detection" },
  { value: "cloud_detection", label: "Cloud Detection" },
  { value: "roboflow_training", label: "Roboflow Training" },
  { value: "manual_upload", label: "Manual Upload" },
];

const LABEL_OPTIONS = [
  { value: "", label: "All Labels" },
  { value: "unlabeled", label: "Unlabeled" },
  { value: "auto_labeled", label: "Auto-Labeled" },
  { value: "human_reviewed", label: "Human Reviewed" },
  { value: "human_corrected", label: "Human Corrected" },
];

const SPLIT_OPTIONS = [
  { value: "", label: "All Splits" },
  { value: "unassigned", label: "Unassigned" },
  { value: "train", label: "Train" },
  { value: "val", label: "Validation" },
  { value: "test", label: "Test" },
];

const VERDICT_OPTIONS = [
  { value: "", label: "All Verdicts" },
  { value: "true_positive", label: "True Positive" },
  { value: "false_positive", label: "False Positive" },
  { value: "uncertain", label: "Uncertain" },
];

export default function DatasetBrowserPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [source, setSource] = useState("");
  const [labelStatus, setLabelStatus] = useState("");
  const [split, setSplit] = useState("");
  const [verdict, setVerdict] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<LearningFrame | null>(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["learning-frames", source, labelStatus, split, verdict, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit, offset: page * limit };
      if (source) params.source = source;
      if (labelStatus) params.label_status = labelStatus;
      if (split) params.split = split;
      if (verdict) params.admin_verdict = verdict;
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dataset Browser</h1>
        <p className="mt-1 text-sm text-gray-500">{total.toLocaleString()} frames captured</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { value: source, onChange: setSource, options: SOURCE_OPTIONS },
          { value: labelStatus, onChange: setLabelStatus, options: LABEL_OPTIONS },
          { value: split, onChange: setSplit, options: SPLIT_OPTIONS },
          { value: verdict, onChange: setVerdict, options: VERDICT_OPTIONS },
        ].map((f, i) => (
          <select key={i} value={f.value} onChange={(e) => { f.onChange(e.target.value); setPage(0); }}
            className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:border-teal-500 focus:outline-none">
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {(source || labelStatus || split || verdict) && (
          <button onClick={() => { setSource(""); setLabelStatus(""); setSplit(""); setVerdict(""); setPage(0); }}
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
    </div>
  );
}
