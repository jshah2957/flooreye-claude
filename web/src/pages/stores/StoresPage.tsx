import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Store as StoreIcon, Loader2 } from "lucide-react";

import api from "@/lib/api";
import type { Store, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import EmptyState from "@/components/shared/EmptyState";
import SkeletonCard from "@/components/shared/SkeletonCard";
import StoreDrawer from "./StoreDrawer";
import { useToast } from "@/components/ui/Toast";

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

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Stores</h1>
          <p className="text-sm text-[#78716C]">{total} stores total</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]"
        >
          <Plus size={16} />
          New Store
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores..."
            className="w-full rounded-md border border-[#E7E5E0] pl-9 pr-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full">
            <tbody>
              <SkeletonCard count={5} layout="table-row" />
            </tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="No stores found"
          description="Create your first store to get started."
          actionLabel="New Store"
          onAction={openCreate}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Name</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Address</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Timezone</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[#78716C]">Created</th>
                <th className="px-4 py-3 text-right font-medium text-[#78716C]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((store) => (
                <tr
                  key={store.id}
                  className="border-b border-[#E7E5E0] hover:bg-[#F8F7F4] cursor-pointer"
                  onClick={() => navigate(`/stores/${store.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[#0D9488]">{store.name}</td>
                  <td className="px-4 py-3 text-[#78716C]">
                    {[store.city, store.state].filter(Boolean).join(", ") || store.address}
                  </td>
                  <td className="px-4 py-3 text-[#78716C]">{store.timezone}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={store.is_active ? "active" : "disabled"} />
                  </td>
                  <td className="px-4 py-3 text-[#78716C]">
                    {new Date(store.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(store)}
                        className="rounded p-1 text-[#78716C] hover:bg-[#F1F0ED] hover:text-[#1C1917]"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(store)}
                        className="rounded p-1 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-[#78716C]">
          <span>
            Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={(page + 1) * limit >= total}
              onClick={() => setPage(page + 1)}
              className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50"
            >
              Next
            </button>
          </div>
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
