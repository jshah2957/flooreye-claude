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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-[384px] overflow-y-auto bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E7E5E0] p-4">
          <h2 className="text-lg font-semibold text-[#1C1917]">
            {isEdit ? "Edit Store" : "New Store"}
          </h2>
          <button onClick={onClose} className="text-[#78716C] hover:text-[#1C1917]">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#1C1917]">
              Store Name *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#1C1917]">
              Address *
            </label>
            <input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#1C1917]">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#1C1917]">
                State / Region
              </label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#1C1917]">
              Country *
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
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

          <div>
            <label className="mb-1 block text-sm font-medium text-[#1C1917]">
              Timezone *
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488]"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#1C1917]">Active</label>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  isActive ? "bg-[#0D9488]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    isActive ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-[#FEE2E2] px-3 py-2 text-sm text-[#DC2626]">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-[#E7E5E0] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#E7E5E0] px-4 py-2 text-sm font-medium text-[#1C1917] hover:bg-[#F1F0ED]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-md bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
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
