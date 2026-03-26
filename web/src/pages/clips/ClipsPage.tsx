import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Film,
  Loader2,
  Trash2,
  Download,
  Scissors,
  Play,
  X,
  Save,
  Image as ImageIcon,
  Cloud,
  HardDrive,
} from "lucide-react";

import api from "@/lib/api";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface Clip {
  id: string;
  camera_id: string;
  store_id: string;
  duration: number;
  file_size_mb: number | null;
  status: string;
  trigger: string;
  source: string | null;
  format: string | null;
  resolution: string | null;
  s3_path: string | null;
  thumbnail_path: string | null;
  clip_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ExtractedFrame {
  id: string;
  clip_id: string;
  frame_index: number;
  timestamp_ms: number;
  s3_path: string;
  frame_url: string;
  frame_base64: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function ClipsPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [playingClip, setPlayingClip] = useState<Clip | null>(null);
  const [extractingClip, setExtractingClip] = useState<string | null>(null);
  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>([]);
  const [selectedFrames, setSelectedFrames] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["clips"],
    queryFn: async () => {
      const res = await api.get("/clips", { params: { limit: 50 } });
      return res.data;
    },
    refetchInterval: 15000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/clips/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clips"] });
      setDeleteTarget(null);
      success("Clip and files deleted");
    },
    onError: () => showError("Failed to delete clip"),
  });

  const extractMutation = useMutation({
    mutationFn: async (clipId: string) => {
      setExtractingClip(clipId);
      const res = await api.post(`/clips/${clipId}/extract-frames`, { num_frames: 10 });
      return res.data.data;
    },
    onSuccess: (data) => {
      setExtractedFrames(data.frames || []);
      setSelectedFrames(new Set());
      success(`Extracted ${data.frame_count} frames`);
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to extract frames");
      setExtractingClip(null);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!extractingClip || selectedFrames.size === 0) return;
      const paths = extractedFrames
        .filter((f) => selectedFrames.has(f.id))
        .map((f) => f.s3_path);
      const res = await api.post(`/clips/${extractingClip}/save-frames`, {
        frame_paths: paths,
        split: "train",
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      success(`Saved ${data?.saved_count || 0} frames to dataset`);
      setExtractingClip(null);
      setExtractedFrames([]);
      setSelectedFrames(new Set());
    },
    onError: () => showError("Failed to save frames"),
  });

  function handleDownload(clip: Clip) {
    if (clip.clip_url) {
      window.open(clip.clip_url, "_blank");
    } else {
      // Fetch presigned URL from backend
      api.get(`/clips/local/${clip.id}`).then((res) => {
        const url = res.data?.data?.clip_url;
        if (url) window.open(url, "_blank");
        else showError("No download URL available");
      });
    }
  }

  function toggleFrame(id: string) {
    setSelectedFrames((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const clips: Clip[] = data?.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recorded Clips</h1>
        <p className="mt-1 text-sm text-gray-500">
          {clips.length} clip{clips.length !== 1 ? "s" : ""} available
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 size={28} className="animate-spin text-teal-600" />
        </div>
      ) : clips.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No clips recorded"
          description="Record clips from the monitoring page or camera detail. Edge agents also record automatically on detection."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip) => (
            <div
              key={clip.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
            >
              {/* Thumbnail / Play */}
              <div
                className="relative aspect-video cursor-pointer bg-gray-900"
                onClick={() => clip.clip_url && setPlayingClip(clip)}
              >
                {clip.thumbnail_url ? (
                  <img
                    src={clip.thumbnail_url}
                    alt="Clip thumbnail"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Film size={32} className="text-gray-600" />
                  </div>
                )}
                {clip.clip_url && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100">
                    <div className="rounded-full bg-white/90 p-3">
                      <Play size={20} className="text-gray-900" />
                    </div>
                  </div>
                )}
                {/* Duration badge */}
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {formatDuration(clip.duration)}
                </span>
                {/* Source badge */}
                {clip.source && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {clip.source === "edge" ? <HardDrive size={10} /> : <Cloud size={10} />}
                    {clip.source}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      clip.status === "completed"
                        ? "bg-green-50 text-green-700"
                        : clip.status === "recording"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {clip.status === "recording" && (
                      <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    )}
                    {clip.status}
                  </span>
                  {clip.file_size_mb && (
                    <span className="text-[10px] text-gray-400">{clip.file_size_mb.toFixed(1)} MB</span>
                  )}
                  {clip.resolution && (
                    <span className="text-[10px] text-gray-400">{clip.resolution}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(clip.created_at).toLocaleString()}
                  {clip.trigger && ` · ${clip.trigger}`}
                </p>

                {/* Actions */}
                <div className="mt-3 flex gap-1.5">
                  {clip.status === "completed" && (
                    <>
                      <button
                        onClick={() => handleDownload(clip)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 py-1.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <Download size={11} /> Download
                      </button>
                      <button
                        onClick={() => extractMutation.mutate(clip.id)}
                        disabled={extractMutation.isPending}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-200 py-1.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {extractMutation.isPending && extractingClip === clip.id ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Scissors size={11} />
                        )}
                        Extract
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDeleteTarget(clip.id)}
                    className="rounded-lg border border-red-200 px-2 py-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Player Modal */}
      {playingClip && playingClip.clip_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setPlayingClip(null)}>
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPlayingClip(null)}
              className="absolute -right-2 -top-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X size={20} />
            </button>
            <video
              src={playingClip.clip_url}
              controls
              autoPlay
              className="w-full rounded-xl"
            />
            <p className="mt-2 text-center text-xs text-gray-400">
              {formatDuration(playingClip.duration)} · {playingClip.file_size_mb?.toFixed(1)} MB · {playingClip.resolution || ""}
            </p>
          </div>
        </div>
      )}

      {/* Frame Extraction Modal */}
      {extractingClip && extractedFrames.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Extracted Frames</h3>
                <p className="text-sm text-gray-500">
                  {extractedFrames.length} frames · {selectedFrames.size} selected
                </p>
              </div>
              <div className="flex gap-2">
                {selectedFrames.size > 0 && (
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save to Dataset ({selectedFrames.size})
                  </button>
                )}
                <button
                  onClick={() => { setExtractingClip(null); setExtractedFrames([]); setSelectedFrames(new Set()); }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-5">
              {extractedFrames.map((frame) => (
                <div
                  key={frame.id}
                  onClick={() => toggleFrame(frame.id)}
                  className={`cursor-pointer overflow-hidden rounded-lg border-2 transition ${
                    selectedFrames.has(frame.id)
                      ? "border-teal-500 ring-2 ring-teal-500/20"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <img
                    src={frame.frame_url || `data:image/jpeg;base64,${frame.frame_base64}`}
                    alt={`Frame ${frame.frame_index}`}
                    className="aspect-video w-full object-cover"
                  />
                  <div className="px-2 py-1">
                    <span className="text-[10px] text-gray-500">
                      {(frame.timestamp_ms / 1000).toFixed(1)}s · #{frame.frame_index}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Clip"
        description="Delete this clip and all associated files permanently?"
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
