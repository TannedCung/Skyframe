const statusStyles: Record<string, string> = {
  current: "bg-teal-400 text-teal-800",
  active: "bg-teal-400 text-teal-800",
  draft: "bg-cream-300 text-ink-900",
  watching: "bg-yellow-300 text-ink-900",
  archived: "bg-yellow-300 text-ink-900",
};

const statusLabels: Record<string, string> = {
  current: "Current",
  active: "Current",
  draft: "Draft",
  watching: "Watching prices",
  archived: "Archived",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block text-[10px] font-medium px-2.5 py-1 rounded-full tracking-[0.12em] uppercase ${statusStyles[status] ?? "bg-cream-300 text-ink-900"}`}
      style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontWeight: 500,
        letterSpacing: "0.12em",
      }}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}
