import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Store as StoreIcon, Loader2, MoreHorizontal, MapPin, ChevronLeft, ChevronRight } from "lucide-react";

import api from "@/lib/api";
import type { Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import EmptyState from "@/components/shared/EmptyState";
import StoreDrawer from "./StoreDrawer";
import { useToast } from "@/components/ui/Toast";

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-3.5 sm:px-6"><div className="h-4 w-32 animate-pulse rounded bg-gray-200" /></td>
      <td className="hidden px-4 py-3.5 md:table-cell sm:px-6"><div className="h-4 w-40 animate-pulse rounded bg-gray-200" /></td>
      <td className="px-4 py-3.5 sm:px-6"><div className="h-4 w-24 animate-pulse rounded bg-gray-200" /></td>
      <td className="hidden px-4 py-3.5 md:table-cell sm:px-6"><div className="h-4 w-28 animate-pulse rounded bg-gray-200" /></td>
      <td className="px-4 py-3.5 sm:px-6"><div className="h-5 w-14 animate-pulse rounded-full bg-gray-200" /></td>
      <td className="hidden px-4 py-3.5 lg:table-cell sm:px-6"><div className="h-4 w-8 animate-pulse rounded bg-gray-200" /></td>
      <td className="hidden px-4 py-3.5 lg:table-cell sm:px-6"><div className="h-4 w-20 animate-pulse rounded bg-gray-200" /></td>
      <td className="px-4 py-3.5 sm:px-6"><div className="h-6 w-6 animate-pulse rounded bg-gray-200" /></td>
    </tr>
  );
}

export default function StoresPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null);

  // Action menu state
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["stores", page, limit],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Store>>("/stores", {
        params: { offset: page * limit, limit },
      });
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/stores/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      setDeleteTarget(null);
      success("Store deleted");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to delete store");
    },
  });

  const stores = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  // Client-side filtering
  const filtered = stores.filter((s) => {
    if (search && !(s.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === "active" && !s.is_active) return false;
    if (statusFilter === "inactive" && s.is_active) return false;
    return true;
  });

  function openCreate() {
    setEditingStore(null);
    setDrawerOpen(true);
  }

  function openEdit(store: Store) {
    setEditingStore(store);
    setDrawerOpen(true);
  }

  const startItem = page * limit + 1;
  const endItem = Math.min((page + 1) * limit, total);

  return (
    <div className="min-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Stores</h1>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {total}
          </span>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0F766E] hover:shadow-md active:scale-[0.98]"
        >
          <Plus size={16} strokeWidth={2.5} />
          Add Store
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition-colors focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Name</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell sm:px-6">Address</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">City/State</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell sm:px-6">Timezone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell sm:px-6">Cameras</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell sm:px-6">Created</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="No stores yet"
          description={search || statusFilter !== "all" ? "No stores match your filters. Try adjusting your search." : "Add your first store to get started."}
          actionLabel="Add Store"
          onAction={openCreate}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Name</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell sm:px-6">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">City/State</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell sm:px-6">Timezone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Status</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell sm:px-6">Cameras</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell sm:px-6">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((store) => (
                  <tr
                    key={store.id}
                    className="group cursor-pointer transition-colors hover:bg-gray-50/70"
                    onClick={() => navigate(`/stores/${store.id}`)}
                  >
                    <td className="px-4 py-3.5 sm:px-6">
                      <span className="font-semibold text-[#0D9488] group-hover:text-[#0F766E]">{store.name}</span>
                    </td>
                    <td className="hidden px-4 py-3.5 text-gray-500 md:table-cell sm:px-6">
                      {store.address || "--"}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 sm:px-6">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={13} className="shrink-0 text-gray-400" />
                        {[store.city, store.state].filter(Boolean).join(", ") || "--"}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 text-gray-500 md:table-cell sm:px-6">
                      <span className="font-mono text-xs">{store.timezone}</span>
                    </td>
                    <td className="px-4 py-3.5 sm:px-6">
                      <StatusBadge status={store.is_active ? "active" : "disabled"} />
                    </td>
                    <td className="hidden px-4 py-3.5 lg:table-cell sm:px-6">
                      <span className="inline-flex items-center justify-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {(store as any).camera_count ?? "--"}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3.5 text-gray-500 lg:table-cell sm:px-6">
                      {new Date(store.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5 text-right sm:px-6">
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuOpen(menuOpen === store.id ? null : store.id)}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {menuOpen === store.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                            <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                              <button
                                onClick={() => { openEdit(store); setMenuOpen(null); }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Pencil size={14} /> Edit Store
                              </button>
                              <button
                                onClick={() => { setDeleteTarget(store); setMenuOpen(null); }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={14} /> Delete Store
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination inside table card */}
          {total > limit && (
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-3">
              <p className="text-sm text-gray-500">
                Showing <span className="font-medium text-gray-700">{startItem}</span> to{" "}
                <span className="font-medium text-gray-700">{endItem}</span> of{" "}
                <span className="font-medium text-gray-700">{total}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  disabled={(page + 1) * limit >= total}
                  onClick={() => setPage(page + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Drawer */}
      <StoreDrawer
        open={drawerOpen}
        store={editingStore}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Store"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This will disable all cameras in this store.`}
        confirmLabel="Delete"
        confirmText={deleteTarget?.name}
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
