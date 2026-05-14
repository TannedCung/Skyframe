interface FlightRowProps {
  leg: string;
  code: string;
  airline: string;
  time: string;
  price: string;
  note?: string;
}

export function FlightRow({ leg, code, airline, time, price, note }: FlightRowProps) {
  return (
    <div
      className="grid items-center px-[18px] py-3.5"
      style={{
        gridTemplateColumns: "60px 1fr 110px 110px",
        borderTop: "1px solid var(--color-line, #EFE4C8)",
      }}
    >
      <span
        className="mono-label"
        style={{ color: "var(--color-coral-700, #B85633)", fontSize: 11 }}
      >
        {leg}
      </span>
      <div>
        <div
          className="text-sm font-medium"
          style={{ fontFamily: "'Geist Mono', monospace", color: "var(--color-ink-900, #2A1E15)" }}
        >
          {code}
        </div>
        <div className="text-xs" style={{ color: "var(--color-ink-500, #968471)" }}>
          {airline} · {time}
          {note ? ` · ${note}` : ""}
        </div>
      </div>
      <div
        className="text-right text-xs"
        style={{ fontFamily: "'Geist Mono', monospace", color: "var(--color-ink-700, #6B5A4D)" }}
      >
        {time.split(" · ")[1] ?? ""}
      </div>
      <div
        className="text-right font-semibold"
        style={{ fontFamily: "'Geist Mono', monospace", color: "var(--color-ink-900, #2A1E15)" }}
      >
        {price}
      </div>
    </div>
  );
}
