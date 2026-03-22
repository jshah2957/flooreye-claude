import { useState, useEffect, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";

import api from "@/lib/api";
import type { Store } from "@/types";
import { useToast } from "@/components/ui/Toast";

interface StoreDrawerProps {
  open: boolean;
  store: Store | null; // null = create mode
  onClose: () => void;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export default function StoreDrawer({ open, store, onClose }: StoreDrawerProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const isEdit = !!store;

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("US");
  const [timezone, setTimezone] = useState("America/New_York");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (store) {
      setName(store.name);
      setAddress(store.address);
      setCity(store.city ?? "");
      setState(store.state ?? "");
      setCountry(store.country);
      setTimezone(store.timezone);
      setIsActive(store.is_active);
    } else {
      setName("");
      setAddress("");
      setCity("");
      setState("");
      setCountry("US");
      setTimezone("America/New_York");
      setIsActive(true);
    }
    setError("");
  }, [store, open]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/stores", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      onClose();
      success("Store created");
    },
    onError: (err: any) => {
      setError("Failed to create store");
      showError(err?.response?.data?.detail || "Failed to create store");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/stores/${store!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["store", store!.id] });
      onClose();
      success("Store updated");
    },
    onError: (err: any) => {
      setError("Failed to update store");
      showError(err?.response?.data?.detail || "Failed to update store");
    },
  });

  const loading = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const payload: Record<string, unknown> = {
      name,
      address,
      city: city || null,
      state: state || null,
      country,
      timezone,
    };

    if (isEdit) {
      payload.is_active = isActive;
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl sm:w-96 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? "Edit Store" : "Create Store"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              {isEdit ? "Update store information" : "Add a new store location"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form - scrollable */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Store Name <span className="text-red-400">*</span>
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Downtown Branch"
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
              />
            </div>

            {/* Address */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Address <span className="text-red-400">*</span>
              </label>
              <input
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main Street"
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
              />
            </div>

            {/* City / State */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">City</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  State / Region
                </label>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                />
              </div>
            </div>

            {/* Country */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Country <span className="text-red-400">*</span>
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="DE">Germany</option>
                <option value="FR">France</option>
                <option value="AU">Australia</option>
                <option value="JP">Japan</option>
                <option value="IN">India</option>
              </select>
            </div>

            {/* Timezone */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Timezone <span className="text-red-400">*</span>
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Toggle (edit only) */}
            {isEdit && (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Active</label>
                  <p className="text-xs text-gray-400">Enable or disable this store</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    isActive ? "bg-[#0D9488]" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      isActive ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>

          {/* Footer - sticky at bottom */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0F766E] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Save Changes" : "Create Store"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
