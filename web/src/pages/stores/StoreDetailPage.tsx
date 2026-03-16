import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Clock, Calendar } from "lucide-react";

import api from "@/lib/api";
import type { Store, Camera, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import StoreDrawer from "./StoreDrawer";

const TABS = ["Overview", "Cameras", "Incidents", "Edge Agent", "Detection Overrides", "Audit Log"] as const;
type Tab = (typeof TABS)[number];

export default function StoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: store, isLoading } = useQuery({
    queryKey: ["store", id],
    queryFn: async () => {
      const res = await api.get<{ data: Store }>(`/stores/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const { data: camerasData } = useQuery({
    queryKey: ["cameras", { store_id: id }],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Camera>>("/cameras", {
        params: { store_id: id, limit: 100 },
      });
      return res.data;
    },
    enabled: !!id && activeTab === "Cameras",
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#0D9488]" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[#78716C]">
        Store not found
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/stores" className="mb-2 inline-flex items-center gap-1 text-sm text-[#78716C] hover:text-[#0D9488]">
          <ArrowLeft size={14} /> Back to Stores
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#1C1917]">{store.name}</h1>
            <p className="text-sm text-[#78716C]">{store.address}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={store.is_active ? "active" : "disabled"} />
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
            >
              Edit Store
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-[#E7E5E0]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-[#0D9488] text-[#0D9488]"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
            <h3 className="mb-4 text-base font-semibold text-[#1C1917]">Store Details</h3>
            <dl className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin size={16} className="mt-0.5 text-[#78716C]" />
                <div>
                  <dt className="text-xs font-medium text-[#78716C]">Address</dt>
                  <dd className="text-sm text-[#1C1917]">
                    {store.address}
                    {store.city && `, ${store.city}`}
                    {store.state && `, ${store.state}`}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock size={16} className="mt-0.5 text-[#78716C]" />
                <div>
                  <dt className="text-xs font-medium text-[#78716C]">Timezone</dt>
                  <dd className="text-sm text-[#1C1917]">{store.timezone}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar size={16} className="mt-0.5 text-[#78716C]" />
                <div>
                  <dt className="text-xs font-medium text-[#78716C]">Created</dt>
                  <dd className="text-sm text-[#1C1917]">
                    {new Date(store.created_at).toLocaleString()}
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-[#E7E5E0] bg-white p-6">
            <h3 className="mb-4 text-base font-semibold text-[#1C1917]">Country</h3>
            <p className="text-sm text-[#1C1917]">{store.country}</p>

            {Object.keys(store.settings).length > 0 && (
              <>
                <h3 className="mb-2 mt-6 text-base font-semibold text-[#1C1917]">Settings</h3>
                <pre className="overflow-auto rounded bg-[#F8F7F4] p-3 text-xs text-[#1C1917]">
                  {JSON.stringify(store.settings, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "Cameras" && (
        <div>
          {camerasData?.data?.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0] text-sm text-[#78716C]">
              No cameras in this store yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {camerasData?.data?.map((cam) => (
                <Link
                  key={cam.id}
                  to={`/cameras/${cam.id}`}
                  className="rounded-lg border border-[#E7E5E0] bg-white p-4 hover:border-[#0D9488] transition-colors"
                >
                  {cam.snapshot_base64 ? (
                    <img
                      src={`data:image/jpeg;base64,${cam.snapshot_base64}`}
                      alt={cam.name}
                      className="mb-3 h-[180px] w-full rounded object-cover bg-gray-100"
                    />
                  ) : (
                    <div className="mb-3 flex h-[180px] items-center justify-center rounded bg-gray-100 text-xs text-[#78716C]">
                      No snapshot
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#1C1917]">{cam.name}</span>
                    <StatusBadge status={cam.status} />
                  </div>
                  <p className="mt-1 text-xs text-[#78716C]">
                    {(cam.stream_type ?? 'rtsp').toUpperCase()} &middot; {cam.floor_type ?? 'tile'} &middot; {cam.inference_mode ?? 'cloud'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Placeholder tabs */}
      {["Incidents", "Edge Agent", "Detection Overrides", "Audit Log"].includes(activeTab) && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[#E7E5E0]">
          <p className="text-sm text-[#78716C]">{activeTab} — coming in a later phase</p>
        </div>
      )}

      {/* Edit Drawer */}
      <StoreDrawer
        open={drawerOpen}
        store={store}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
