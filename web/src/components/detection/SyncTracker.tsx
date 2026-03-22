import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import api from '../../lib/api';

interface SyncDetail {
  id: string;
  name: string;
  config_version: number | null;
  config_status: string | null;
  last_config_push_at: string | null;
  last_config_ack_at: string | null;
  config_ack_error: string | null;
}

interface SyncTrackerProps {
  cameraIds: string[];
  onComplete?: () => void;
  onDismiss?: () => void;
}

export function SyncTracker({ cameraIds, onComplete, onDismiss }: SyncTrackerProps) {
  const [cameras, setCameras] = useState<SyncDetail[]>([]);
  const [polling, setPolling] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!cameraIds.length) return;

    const fetchStatus = async () => {
      try {
        const res = await api.get('/detection-control/sync-status', {
          params: { camera_ids: cameraIds.join(',') },
        });
        setCameras(res.data.data || []);

        // Check if all resolved
        const all = res.data.data || [];
        const allDone = all.length > 0 && all.every(
          (c: SyncDetail) => c.config_status === 'received' || c.config_status === 'sync_failed'
        );
        if (allDone) {
          setPolling(false);
          onComplete?.();
        }
      } catch {
        // Silent — will retry on next interval
      }
    };

    fetchStatus();
    const interval = setInterval(() => {
      setElapsed(prev => prev + 3);
      fetchStatus();
    }, 3000);

    // Auto-stop after 30s
    const timeout = setTimeout(() => {
      setPolling(false);
      clearInterval(interval);
    }, 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [cameraIds]);

  if (!cameraIds.length) return null;

  const synced = cameras.filter(c => c.config_status === 'received').length;
  const failed = cameras.filter(c => c.config_status === 'sync_failed').length;
  const pending = cameras.length - synced - failed;

  const getIcon = (status: string | null) => {
    switch (status) {
      case 'received': return <CheckCircle2 size={16} className="text-green-500" />;
      case 'push_pending': return <Clock size={16} className="text-amber-500" />;
      case 'sync_failed': return <XCircle size={16} className="text-red-500" />;
      default: return <Loader2 size={16} className="text-gray-400 animate-spin" />;
    }
  };

  const getLabel = (status: string | null) => {
    switch (status) {
      case 'received': return 'Synced';
      case 'push_pending': return 'Queued';
      case 'sync_failed': return 'Failed';
      default: return 'Pushing...';
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          {polling ? (
            <Loader2 size={16} className="animate-spin text-[#0D9488]" />
          ) : synced === cameras.length ? (
            <CheckCircle2 size={16} className="text-green-500" />
          ) : (
            <AlertTriangle size={16} className="text-amber-500" />
          )}
          Edge Sync {polling ? `(${elapsed}s)` : 'Complete'}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">
            Dismiss
          </button>
        )}
      </div>

      {/* Summary bar */}
      {cameras.length > 0 && (
        <div className="mb-3 flex gap-4 text-xs">
          {synced > 0 && <span className="text-green-600">{synced} synced</span>}
          {pending > 0 && <span className="text-amber-600">{pending} pending</span>}
          {failed > 0 && <span className="text-red-600">{failed} failed</span>}
        </div>
      )}

      {/* Per-camera list */}
      <div className="space-y-2">
        {cameras.map(cam => (
          <div key={cam.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              {getIcon(cam.config_status)}
              <span className="font-medium text-gray-700">{cam.name || cam.id}</span>
            </div>
            <div className="flex items-center gap-2">
              {cam.config_version && (
                <span className="text-xs text-gray-400">v{cam.config_version}</span>
              )}
              <span className={`text-xs font-medium ${
                cam.config_status === 'received' ? 'text-green-600' :
                cam.config_status === 'sync_failed' ? 'text-red-600' :
                'text-amber-600'
              }`}>
                {getLabel(cam.config_status)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Error details */}
      {cameras.filter(c => c.config_ack_error).map(cam => (
        <div key={`err-${cam.id}`} className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {cam.name}: {cam.config_ack_error}
        </div>
      ))}
    </div>
  );
}
