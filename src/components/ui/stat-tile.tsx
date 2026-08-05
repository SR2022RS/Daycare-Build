import type { LucideIcon } from "lucide-react";

export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "warning";
}) {
  const isWarning = tone === "warning";

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
          isWarning ? "bg-red-100 text-red-700" : "bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className={`text-2xl font-semibold ${isWarning ? "text-red-700" : "text-gray-900"}`}>
          {value}
        </div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}
