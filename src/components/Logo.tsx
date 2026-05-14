export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-2.5 font-bold tracking-tight"
      style={{
        fontSize: size,
        fontFamily: "'Bricolage Grotesque', sans-serif",
        letterSpacing: "-0.02em",
        color: "var(--color-ink-900, #2A1E15)",
      }}
    >
      <svg width={size + 4} height={size + 4} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--color-cream-100, #FFF6DE)" />
        <g transform="translate(11,11)">
          <rect
            x="0"
            y="0"
            width="42"
            height="42"
            rx="4"
            fill="none"
            stroke="var(--color-ink-900, #2A1E15)"
            strokeWidth="2.5"
          />
          <line
            x1="0"
            y1="11"
            x2="42"
            y2="11"
            stroke="var(--color-ink-900, #2A1E15)"
            strokeWidth="2.5"
          />
          <rect x="1.5" y="12.5" width="39" height="11" fill="var(--color-teal-400, #8BDFDD)" />
          <rect x="1.5" y="23.5" width="39" height="17" fill="var(--color-yellow-300, #FFE394)" />
          <circle cx="30" cy="20" r="5.5" fill="var(--color-coral-500, #F48F68)" />
        </g>
      </svg>
      Skyframe
    </span>
  );
}
