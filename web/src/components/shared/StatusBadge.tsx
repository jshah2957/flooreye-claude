interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  online: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", dot: "bg-[#16A34A]" },
  connected: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", dot: "bg-[#16A34A]" },
  production: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", dot: "bg-[#16A34A]" },
  active: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", dot: "bg-[#16A34A]" },
  staging: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", dot: "bg-[#D97706]" },
  acknowledged: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", dot: "bg-[#D97706]" },
  offline: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", dot: "bg-[#DC2626]" },
  error: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", dot: "bg-[#DC2626]" },
  critical: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", dot: "bg-[#DC2626]" },
  testing: { bg: "bg-[#DBEAFE]", text: "text-[#2563EB]", dot: "bg-[#2563EB]" },
  running: { bg: "bg-[#DBEAFE]", text: "text-[#2563EB]", dot: "bg-[#2563EB]" },
  cloud: { bg: "bg-[#DBEAFE]", text: "text-[#2563EB]", dot: "bg-[#2563EB]" },
  edge: { bg: "bg-[#F3E8FF]", text: "text-[#7C3AED]", dot: "bg-[#7C3AED]" },
  hybrid: { bg: "bg-[#CFFAFE]", text: "text-[#0891B2]", dot: "bg-[#0891B2]" },
  retired: { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-500" },
  disabled: { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-500" },
  not_configured: { bg: "bg-gray-50", text: "text-gray-400", dot: "bg-gray-400" },
};

const DEFAULT_CONFIG = { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-500" };

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status.toLowerCase()] ?? DEFAULT_CONFIG;
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${config.bg} ${config.text} ${size === "sm" ? "text-xs" : "text-sm"}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {label}
    </span>
  );
}
