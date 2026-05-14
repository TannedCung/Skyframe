import { LOGO_CSS_COLORS, logoMarkSvg } from "@/lib/logo-mark";

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
      <span
        dangerouslySetInnerHTML={{
          __html: logoMarkSvg(size + 4, LOGO_CSS_COLORS),
        }}
      />
      Skyframe
    </span>
  );
}
