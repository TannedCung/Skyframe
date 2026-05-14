export interface ParsedDay {
  number: number;
  title: string;
  body: string;
}

export interface ParsedPlan {
  title: string | null;
  brief: string;
  destinations: string;
  mustHave: string;
  flights: string;
  days: ParsedDay[];
  notes: string;
  unknown: string;
  raw: string;
}

const EMPTY: ParsedPlan = {
  title: null,
  brief: "",
  destinations: "",
  mustHave: "",
  flights: "",
  days: [],
  notes: "",
  unknown: "",
  raw: "",
};

type SectionKey = "brief" | "destinations" | "mustHave" | "flights" | "dayByDay" | "notes" | null;

function classifyH2(heading: string): SectionKey {
  const h = heading.trim().toLowerCase();
  if (/^brief$/.test(h)) return "brief";
  if (/^destinations?$/.test(h)) return "destinations";
  if (/^must[- ]?have/.test(h)) return "mustHave";
  if (/^flights?$/.test(h)) return "flights";
  if (/^day[- ]?by[- ]?day$/.test(h)) return "dayByDay";
  if (/^notes?$/.test(h)) return "notes";
  return null;
}

const DAY_HEADING = /^day\s+(\d+)\s*(?:[—:\-–]\s*(.+))?$/i;

export function parsePlan(md: string): ParsedPlan {
  if (!md || !md.trim()) return { ...EMPTY };

  const buckets: Record<Exclude<SectionKey, null>, string[]> = {
    brief: [],
    destinations: [],
    mustHave: [],
    flights: [],
    dayByDay: [],
    notes: [],
  };
  const unknownLines: string[] = [];
  let title: string | null = null;
  let current: SectionKey = null;
  let seenAnyH2 = false;

  const lines = md.split("\n");
  for (const line of lines) {
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) {
      if (!title) title = h1[1]!.trim();
      continue;
    }
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      seenAnyH2 = true;
      current = classifyH2(h2[1]!);
      continue;
    }
    if (current) {
      buckets[current].push(line);
    } else if (seenAnyH2) {
      // After at least one H2 but didn't match any known section — preserve.
      unknownLines.push(line);
    } else if (line.trim()) {
      // Pre-section preamble — treat as brief.
      buckets.brief.push(line);
    }
  }

  const days = parseDays(buckets.dayByDay.join("\n"));

  return {
    title,
    brief: trimSection(buckets.brief.join("\n")),
    destinations: trimSection(buckets.destinations.join("\n")),
    mustHave: trimSection(buckets.mustHave.join("\n")),
    flights: trimSection(buckets.flights.join("\n")),
    days,
    notes: trimSection(buckets.notes.join("\n")),
    unknown: trimSection(unknownLines.join("\n")),
    raw: md,
  };
}

function parseDays(body: string): ParsedDay[] {
  if (!body.trim()) return [];
  const lines = body.split("\n");
  const out: ParsedDay[] = [];
  let current: { number: number; title: string; body: string[] } | null = null;

  for (const line of lines) {
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      if (current) {
        out.push({ ...current, body: trimSection(current.body.join("\n")) });
      }
      const head = h3[1]!.trim();
      const m = DAY_HEADING.exec(head);
      if (m) {
        current = {
          number: parseInt(m[1]!, 10),
          title: (m[2] ?? "").trim(),
          body: [],
        };
      } else {
        current = {
          number: out.length + 1,
          title: head,
          body: [],
        };
      }
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) {
    out.push({ ...current, body: trimSection(current.body.join("\n")) });
  }
  return out;
}

function trimSection(s: string): string {
  return s.replace(/^\n+/, "").replace(/\n+$/, "");
}

export function isEmptyParsed(p: ParsedPlan): boolean {
  return (
    !p.brief &&
    !p.destinations &&
    !p.mustHave &&
    !p.flights &&
    p.days.length === 0 &&
    !p.notes &&
    !p.unknown
  );
}
