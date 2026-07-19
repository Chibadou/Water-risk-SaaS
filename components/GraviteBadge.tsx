import { graviteInfo } from "@/lib/gravite";

export default function GraviteBadge({ niveau }: { niveau?: string }) {
  const info = graviteInfo(niveau);
  if (!info) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-3 py-0.5 text-sm font-medium text-emerald-900">
        Aucune restriction
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-semibold ${info.badgeClass}`}
    >
      {info.label}
    </span>
  );
}
