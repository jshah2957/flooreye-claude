import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Loader2, Trash2, X, Pencil } from "lucide-react";

import api from "@/lib/api";
import type { User, PaginatedResponse } from "@/types";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [page, setPage] = useState(0);
  const [roleFilter, setRoleFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const limit = 20;

  // Create form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");

  const { data, isLoading } = useQuery({
    queryKey: ["users", page, roleFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = { offset: page * limit, limit };
      if (roleFilter) params.role = roleFilter;
      const res = await api.get<PaginatedResponse<User>>("/auth/users", { params });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/auth/users", { email, name, password, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setEmail(""); setName(""); setPassword("");
      success("User created");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to create user");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleteTarget(null);
      success("User deactivated");
    },
    onError: (err: any) => {
      showError(err?.response?.data?.detail || "Failed to deactivate user");
    },
  });

  const editMutation = useMutation({
    mutationFn: () => api.put(`/auth/users/${editTarget?.id}`, { name: editName, role: editRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditTarget(null);
      success("User updated");
    },
    onError: (err: any) => showError(err?.response?.data?.detail || "Update failed"),
  });

  const users = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1C1917]">User Management</h1>
        <button onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E]">
          <Plus size={16} /> New User
        </button>
      </div>

      <div className="mb-4">
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
          <option value="">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="org_admin">Org Admin</option>
          <option value="ml_engineer">ML Engineer</option>
          <option value="operator">Operator</option>
          <option value="store_owner">Store Owner</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-[#0D9488]" /></div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users found" description="Create the first user." actionLabel="New User" onAction={() => setCreateOpen(true)} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E7E5E0] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#F8F7F4]">
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Name</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Email</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Role</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Status</th>
                <th className="px-4 py-2 text-left font-medium text-[#78716C]">Last Login</th>
                <th className="px-4 py-2 text-right font-medium text-[#78716C]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[#E7E5E0] hover:bg-[#F8F7F4]">
                  <td className="px-4 py-2 font-medium text-[#1C1917]">{u.name}</td>
                  <td className="px-4 py-2 text-[#78716C]">{u.email}</td>
                  <td className="px-4 py-2"><StatusBadge status={u.role} size="sm" /></td>
                  <td className="px-4 py-2"><StatusBadge status={u.is_active ? "active" : "disabled"} size="sm" /></td>
                  <td className="px-4 py-2 text-[#78716C]">{u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => { setEditTarget(u); setEditName(u.name); setEditRole(u.role); }}
                      className="rounded p-1 text-[#78716C] hover:bg-[#F0FDFA] hover:text-[#0D9488]"><Pencil size={12} /></button>
                    <button onClick={() => setDeleteTarget(u)}
                      className="ml-1 rounded p-1 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-[#78716C]">
          <span>Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50">Previous</button>
            <button disabled={(page + 1) * limit >= total} onClick={() => setPage(page + 1)} className="rounded-md border border-[#E7E5E0] px-3 py-1 hover:bg-[#F1F0ED] disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      {/* Create Drawer */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-[384px] overflow-y-auto bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
              <h2 className="text-lg font-semibold text-[#1C1917]">New User</h2>
              <button onClick={() => setCreateOpen(false)} className="text-[#78716C]"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Password *</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#1C1917]">Role *</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="viewer">Viewer</option>
                  <option value="store_owner">Store Owner</option>
                  <option value="operator">Operator</option>
                  <option value="ml_engineer">ML Engineer</option>
                  <option value="org_admin">Org Admin</option>
                </select>
              </div>
              <button onClick={() => createMutation.mutate()} disabled={!email || !name || !password || createMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />} Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[400px] rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Edit User</h3>
              <button onClick={() => setEditTarget(null)} className="text-[#78716C]"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">Email</label>
                <input value={editTarget.email} disabled
                  className="w-full rounded-md border border-[#E7E5E0] bg-[#F8F7F4] px-3 py-2 text-sm text-[#78716C]" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#78716C]">Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]">
                  <option value="viewer">Viewer</option>
                  <option value="store_owner">Store Owner</option>
                  <option value="operator">Operator</option>
                  <option value="ml_engineer">ML Engineer</option>
                  <option value="org_admin">Org Admin</option>
                </select>
              </div>
              <p className="text-[10px] text-[#78716C]">Last login: {editTarget.last_login ? new Date(editTarget.last_login).toLocaleString() : "Never"}</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditTarget(null)} className="rounded-md border border-[#E7E5E0] px-3 py-1.5 text-xs">Cancel</button>
              <button onClick={() => editMutation.mutate()} disabled={editMutation.isPending}
                className="rounded-md bg-[#0D9488] px-4 py-1.5 text-xs text-white hover:bg-[#0F766E] disabled:opacity-50">
                {editMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} title="Deactivate User"
        description={`Deactivate "${deleteTarget?.name}"? They will no longer be able to log in.`}
        confirmLabel="Deactivate" destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
