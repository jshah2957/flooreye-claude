interface SkeletonCardProps {
  count?: number;
  layout?: "table-row" | "card";
}

function SkeletonPulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#E7E5E0] ${className ?? ""}`} />;
}

export default function SkeletonCard({ count = 3, layout = "card" }: SkeletonCardProps) {
  if (layout === "table-row") {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} className="border-b border-[#E7E5E0]">
            <td className="px-4 py-3"><SkeletonPulse className="h-4 w-32" /></td>
            <td className="px-4 py-3"><SkeletonPulse className="h-4 w-24" /></td>
            <td className="px-4 py-3"><SkeletonPulse className="h-4 w-20" /></td>
            <td className="px-4 py-3"><SkeletonPulse className="h-4 w-16" /></td>
            <td className="px-4 py-3"><SkeletonPulse className="h-4 w-16" /></td>
          </tr>
        ))}
      </>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-[#E7E5E0] bg-white p-4">
          <SkeletonPulse className="mb-3 h-[180px] w-full rounded" />
          <SkeletonPulse className="mb-2 h-4 w-3/4" />
          <SkeletonPulse className="mb-2 h-3 w-1/2" />
          <SkeletonPulse className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
