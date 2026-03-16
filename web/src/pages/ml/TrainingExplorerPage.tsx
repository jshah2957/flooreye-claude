import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, Loader2, Search } from "lucide-react";

import api from "@/lib/api";
import EmptyState from "@/components/shared/EmptyState";

export default function TrainingExplorerPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [storeId, setStoreId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [labelSource, setLabelSource] = useState("");
  const [floorType, setFloorType] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const res = await api.get("/stores", { params: { limit: 200 } });
      return res.data.data ?? [];
    },
  });

  const { data: cameras } = useQuery({
    queryKey: ["cameras-list", storeId],
    queryFn: async () => {
      const params: Record<string, unknown> = { limit: 200 };
      if (storeId) params.store_id = storeId;
      const res = await api.get("/cameras", { params });
      return res.data.data ?? [];
    },
  });

  const statsParams: Record<string, unknown> = {};
  if (storeId) statsParams.store_id = storeId;
  if (cameraId) statsParams.camera_id = cameraId;
  if (labelSource) statsParams.label_source = labelSource;
  if (dateFrom) statsParams.date_from = dateFrom;
  if (dateTo) statsParams.date_to = dateTo;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dataset-stats", storeId, cameraId, labelSource, dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get("/dataset/stats", { params: statsParams });
      return res.data.data;
    },
  });

  const framesParams: Record<string, unknown> = { limit: 200 };
  if (storeId) framesParams.store_id = storeId;
  if (cameraId) framesParams.camera_id = cameraId;
  if (labelSource) framesParams.label_source = labelSource;
  if (floorType) framesParams.floor_type = floorType;

  const { data: framesData, isLoading: framesLoading } = useQuery({
    queryKey: ["dataset-frames-explorer", storeId, cameraId, labelSource, floorType],
    queryFn: async () => {
      const res = await api.get("/dataset/frames", { params: framesParams });
      return res.data;
    },
  });

  const frames = framesData?.data ?? [];
  const totalFrames = framesData?.meta?.total ?? stats?.total_frames ?? 0;

  // Derive chart data from stats and frames
  const bySplit = (stats?.by_split ?? {}) as Record<string, number>;
  const bySource = (stats?.by_source ?? {}) as Record<string, number>;
  const byClass = (stats?.by_class ?? {}) as Record<string, number>;

  // Camera coverage from frames
  const cameraCounts: Record<string, number> = {};
  frames.forEach((f: any) => {
    const cam = f.camera_id ?? "unknown";
    cameraCounts[cam] = (cameraCounts[cam] || 0) + 1;
  });

  // Store breakdown from frames
  const storeCounts: Record<string, number> = {};
  frames.forEach((f: any) => {
    const s = f.store_id ?? "unknown";
    storeCounts[s] = (storeCounts[s] || 0) + 1;
  });

  // Confidence stats
  const confidences = frames.map((f: any) => f.confidence).filter((c: any) => typeof c === "number");
  const avgConfidence = confidences.length > 0
    ? (confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length).toFixed(3)
    : "N/A";

  // Escalation
  const escalated = frames.filter((f: any) => f.escalated === true).length;

  // Summary table data
  const summaryByStore: Record<string, { total: number; train: number; val: number; test: number; unassigned: number }> = {};
  frames.forEach((f: any) => {
    const key = f.store_id ?? "unknown";
    if (!summaryByStore[key]) summaryByStore[key] = { total: 0, train: 0, val: 0, test: 0, unassigned: 0 };
    summaryByStore[key].total += 1;
    const split = f.split ?? "unassigned";
    if (split in summaryByStore[key]) {
      (summaryByStore[key] as any)[split] += 1;
    }
  });

  const maxClassCount = Math.max(...Object.values(byClass), 1);
  const maxSourceCount = Math.max(...Object.values(bySource), 1);

  async function handleExportCoco() {
    setExporting(true);
    try {
      const res = await api.get("/dataset/export/coco", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "dataset_coco.json");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const headers = ["id", "frame_path", "label_class", "label_source", "split", "confidence", "store_id", "camera_id"];
      const rows = frames.map((f: any) => headers.map((h) => f[h] ?? "").join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "dataset_export.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setExporting(false);
    }
  }

  const isLoading = statsLoading || framesLoading;

  return (
    <div className="min-h-screen bg-[#F8F7F4] p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1C1917]">Training Data Explorer</h1>
        <p className="text-sm text-[#78716C]">Analyze and visualize your training dataset</p>
      </div>

      {/* Filter Bar */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-[#E7E5E0] bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#78716C]">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#78716C]">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#78716C]">Store</label>
          <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setCameraId(""); }}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
            <option value="">All Stores</option>
            {(stores ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#78716C]">Camera</label>
          <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
            <option value="">All Cameras</option>
            {(cameras ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#78716C]">Label Source</label>
          <select value={labelSource} onChange={(e) => setLabelSource(e.target.value)}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
            <option value="">All Sources</option>
            <option value="teacher_roboflow">Teacher (Roboflow)</option>
            <option value="student_pseudolabel">Student</option>
            <option value="human_validated">Human Validated</option>
            <option value="human_corrected">Human Corrected</option>
            <option value="manual_upload">Manual Upload</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#78716C]">Floor Type</label>
          <select value={floorType} onChange={(e) => setFloorType(e.target.value)}
            className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
            <option value="">All Types</option>
            <option value="tile">Tile</option>
            <option value="concrete">Concrete</option>
            <option value="wood">Wood</option>
            <option value="carpet">Carpet</option>
            <option value="vinyl">Vinyl</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-60 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#0D9488]" />
        </div>
      ) : !stats && frames.length === 0 ? (
        <EmptyState icon={BarChart3} title="No data" description="No dataset frames match the current filters." />
      ) : (
        <>
          {/* 2x3 Chart Cards Grid */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Card 1: Frames Over Time */}
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">Frames Over Time</h3>
              <p className="mb-2 text-2xl font-bold text-[#0D9488]">{totalFrames}</p>
              <p className="mb-3 text-xs text-[#78716C]">Total frames in dataset</p>
              {Object.keys(storeCounts).length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#E7E5E0]">
                      <th className="pb-1 text-left font-medium text-[#78716C]">Store</th>
                      <th className="pb-1 text-right font-medium text-[#78716C]">Frames</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(storeCounts).map(([id, count]) => (
                      <tr key={id} className="border-b border-[#E7E5E0] last:border-0">
                        <td className="py-1 text-[#1C1917] truncate max-w-[120px]">{id.slice(0, 12)}...</td>
                        <td className="py-1 text-right text-[#78716C]">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Card 2: Class Distribution */}
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">Class Distribution</h3>
              {Object.keys(byClass).length === 0 ? (
                <p className="text-xs text-[#78716C]">No class data available</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(byClass).map(([cls, count]) => {
                    const pct = totalFrames > 0 ? ((count / totalFrames) * 100).toFixed(1) : "0";
                    return (
                      <div key={cls}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#1C1917] capitalize">{cls}</span>
                          <span className="text-[#78716C]">{count} ({pct}%)</span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                          <div className="h-2 rounded-full bg-[#0D9488]" style={{ width: `${(count / maxClassCount) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Card 3: Label Source Breakdown */}
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">Label Source Breakdown</h3>
              {Object.keys(bySource).length === 0 ? (
                <p className="text-xs text-[#78716C]">No source data available</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(bySource).map(([src, count]) => {
                    const pct = totalFrames > 0 ? ((count / totalFrames) * 100).toFixed(1) : "0";
                    return (
                      <div key={src}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#1C1917]">{src.replace(/_/g, " ")}</span>
                          <span className="text-[#78716C]">{count} ({pct}%)</span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                          <div className="h-2 rounded-full bg-[#14B8A6]" style={{ width: `${(count / maxSourceCount) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Card 4: Camera Coverage */}
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">Camera Coverage</h3>
              {Object.keys(cameraCounts).length === 0 ? (
                <p className="text-xs text-[#78716C]">No camera data available</p>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E7E5E0]">
                        <th className="pb-1 text-left font-medium text-[#78716C]">Camera</th>
                        <th className="pb-1 text-right font-medium text-[#78716C]">Frames</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(cameraCounts).sort((a, b) => b[1] - a[1]).map(([cam, count]) => (
                        <tr key={cam} className="border-b border-[#E7E5E0] last:border-0">
                          <td className="py-1 text-[#1C1917] truncate max-w-[140px]">{cam.slice(0, 12)}...</td>
                          <td className="py-1 text-right text-[#78716C]">{count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Card 5: Confidence Trend */}
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">Confidence Trend</h3>
              <div className="mb-3">
                <p className="text-2xl font-bold text-[#0D9488]">{avgConfidence}</p>
                <p className="text-xs text-[#78716C]">Average confidence ({confidences.length} samples)</p>
              </div>
              {confidences.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#E7E5E0]">
                      <th className="pb-1 text-left font-medium text-[#78716C]">Range</th>
                      <th className="pb-1 text-right font-medium text-[#78716C]">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "0.9 - 1.0", min: 0.9, max: 1.01 },
                      { label: "0.7 - 0.9", min: 0.7, max: 0.9 },
                      { label: "0.5 - 0.7", min: 0.5, max: 0.7 },
                      { label: "< 0.5", min: 0, max: 0.5 },
                    ].map((range) => (
                      <tr key={range.label} className="border-b border-[#E7E5E0] last:border-0">
                        <td className="py-1 text-[#1C1917]">{range.label}</td>
                        <td className="py-1 text-right text-[#78716C]">
                          {confidences.filter((c: number) => c >= range.min && c < range.max).length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Card 6: Escalation Rate */}
            <div className="rounded-lg border border-[#E7E5E0] bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-[#1C1917]">Escalation Rate</h3>
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-2xl font-bold text-[#DC2626]">{escalated}</p>
                  <p className="text-xs text-[#78716C]">Escalated</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#1C1917]">{totalFrames}</p>
                  <p className="text-xs text-[#78716C]">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#78716C]">
                    {totalFrames > 0 ? ((escalated / totalFrames) * 100).toFixed(1) : "0"}%
                  </p>
                  <p className="text-xs text-[#78716C]">Rate</p>
                </div>
              </div>
              <div className="mt-3 h-3 w-full rounded-full bg-gray-100">
                <div className="h-3 rounded-full bg-[#DC2626]"
                  style={{ width: `${totalFrames > 0 ? (escalated / totalFrames) * 100 : 0}%` }} />
              </div>
            </div>
          </div>

          {/* Data Summary Table */}
          <div className="mb-6 overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
            <div className="border-b border-[#E7E5E0] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#1C1917]">Data Summary</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                  <th className="px-4 py-2 text-left font-medium text-[#78716C]">Store</th>
                  <th className="px-4 py-2 text-right font-medium text-[#78716C]">Total</th>
                  <th className="px-4 py-2 text-right font-medium text-[#78716C]">Train</th>
                  <th className="px-4 py-2 text-right font-medium text-[#78716C]">Val</th>
                  <th className="px-4 py-2 text-right font-medium text-[#78716C]">Test</th>
                  <th className="px-4 py-2 text-right font-medium text-[#78716C]">Unassigned</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summaryByStore).length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-4 text-center text-sm text-[#78716C]">No data</td></tr>
                ) : (
                  Object.entries(summaryByStore).map(([sid, row]) => (
                    <tr key={sid} className="border-b border-[#E7E5E0] hover:bg-[#F8F7F4]">
                      <td className="px-4 py-2 text-[#1C1917] truncate max-w-[160px]">{sid.slice(0, 12)}...</td>
                      <td className="px-4 py-2 text-right text-[#1C1917]">{row.total}</td>
                      <td className="px-4 py-2 text-right text-[#78716C]">{row.train}</td>
                      <td className="px-4 py-2 text-right text-[#78716C]">{row.val}</td>
                      <td className="px-4 py-2 text-right text-[#78716C]">{row.test}</td>
                      <td className="px-4 py-2 text-right text-[#78716C]">{row.unassigned}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {Object.keys(bySplit).length > 0 && (
                <tfoot>
                  <tr className="bg-[#F8F7F4] font-medium">
                    <td className="px-4 py-2 text-[#1C1917]">Total</td>
                    <td className="px-4 py-2 text-right text-[#1C1917]">{totalFrames}</td>
                    <td className="px-4 py-2 text-right text-[#78716C]">{bySplit.train ?? 0}</td>
                    <td className="px-4 py-2 text-right text-[#78716C]">{bySplit.val ?? 0}</td>
                    <td className="px-4 py-2 text-right text-[#78716C]">{bySplit.test ?? 0}</td>
                    <td className="px-4 py-2 text-right text-[#78716C]">{bySplit.unassigned ?? 0}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-3">
            <button onClick={handleExportCoco} disabled={exporting}
              className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
              <Download size={16} /> Export COCO
            </button>
            <button onClick={handleExportCsv} disabled={exporting}
              className="flex items-center gap-2 rounded-md border border-[#E7E5E0] bg-white px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED] disabled:opacity-50">
              <Download size={16} /> Export CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
