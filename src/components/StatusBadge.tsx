const statusStyles: Record<string, string> = {
  draft: "bg-cream-200 text-ink-700",
  active: "bg-teal-100 text-teal-800",
  archived: "bg-yellow-300 text-yellow-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusStyles[status] ?? "bg-cream-200 text-ink-700"}`}
    >
      {status}
    </span>
  );
}
