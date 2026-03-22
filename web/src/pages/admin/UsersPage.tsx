import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Loader2, Trash2, X, Pencil, Shield } from "lucide-react";

import api from "@/lib/api";
import type { User, PaginatedResponse } from "@/types";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-red-50 text-red-700",
  org_admin: "bg-purple-50 text-purple-700",
  ml_engineer: "bg-blue-50 text-blue-700",
  operator: "bg-teal-50 text-teal-700",
  store_owner: "bg-amber-50 text-amber-700",
  viewer: "bg-gray-100 text-gray-600",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  org_admin: "Org Admin",
  ml_engineer: "ML Engineer",
  operator: "Operator",
  store_owner: "Store Owner",
  viewer: "Viewer",
};

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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">{total} user{total !== 1 ? "s" : ""} total</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0F766E]">
          <Plus size={16} /> Invite User
        </button>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20">
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
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 px-6 py-4">
                <div className="h-9 w-9 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-48 rounded bg-gray-200" />
                </div>
                <div className="h-6 w-16 rounded-full bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users found" description="Create the first user to get started." actionLabel="Invite User" onAction={() => setCreateOpen(true)} />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Last Login</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                            {(u.name || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{u.name}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-gray-500">{u.email}</td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                          <Shield size={10} />
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.is_active ? "text-green-600" : "text-gray-400"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                          {u.is_active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-gray-500">
                        {u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => { setEditTarget(u); setEditName(u.name); setEditRole(u.role); }}
                            title="Edit"
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-teal-50 hover:text-[#0D9488]">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteTarget(u)}
                            title="Deactivate"
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {users.map((u) => (
              <div key={u.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
                      {(u.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditTarget(u); setEditName(u.name); setEditRole(u.role); }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-teal-50 hover:text-[#0D9488]">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(u)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                    <Shield size={10} />
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.is_active ? "text-green-600" : "text-gray-400"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                    {u.is_active ? "Active" : "Disabled"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {u.last_login ? `Last login: ${new Date(u.last_login).toLocaleDateString()}` : "Never logged in"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm text-sm">
          <span className="text-gray-500">
            Showing {page * limit + 1}&ndash;{Math.min((page + 1) * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">
              Previous
            </button>
            <button disabled={(page + 1) * limit >= total} onClick={() => setPage(page + 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create Drawer */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Invite User</h2>
              <button onClick={() => setCreateOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Password <span className="text-red-500">*</span></label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Role <span className="text-red-500">*</span></label>
                <select value={role} onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20">
                  <option value="viewer">Viewer</option>
                  <option value="store_owner">Store Owner</option>
                  <option value="operator">Operator</option>
                  <option value="ml_engineer">ML Engineer</option>
                  <option value="org_admin">Org Admin</option>
                </select>
              </div>
              <button onClick={() => createMutation.mutate()} disabled={!email || !name || !password || createMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D9488] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />} Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Edit User</h3>
              <button onClick={() => setEditTarget(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                <input value={editTarget.email} disabled
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-400" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20">
                  <option value="viewer">Viewer</option>
                  <option value="store_owner">Store Owner</option>
                  <option value="operator">Operator</option>
                  <option value="ml_engineer">ML Engineer</option>
                  <option value="org_admin">Org Admin</option>
                </select>
              </div>
              <p className="text-xs text-gray-400">Last login: {editTarget.last_login ? new Date(editTarget.last_login).toLocaleString() : "Never"}</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => editMutation.mutate()} disabled={editMutation.isPending}
                className="rounded-lg bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50">
                {editMutation.isPending ? "Saving..." : "Save Changes"}
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
