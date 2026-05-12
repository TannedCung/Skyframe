import { callLLM } from "@/lib/llm/provider";
import { getTripById, getTripDraftPlan, updateTripDraftPlan } from "@/lib/db/queries/trips";
import logger from "@/lib/logger";

const SYSTEM_PROMPT = `You write detailed day-by-day travel itineraries in markdown.

Output rules:
- Return ONLY the markdown for the "## Day-by-Day" section (heading + days).
- One \`### Day N — YYYY-MM-DD · <city>\` per day across the whole trip range.
- Each day: 3-5 bulleted items under Morning / Afternoon / Evening labels.
- Be specific (named neighbourhoods, dishes, attractions, transit hints). Use the user's must-have activities (e.g. a ski day at Hakuba) on the most fitting day.
- No prices, no fabricated booking links.
- No preamble, no closing sentence — markdown only.`;

function buildUserPrompt(args: {
  title: string;
  origin: string;
  destination: string;
  start: string;
  end: string;
  durationDays: number;
  draftPlan: string | null;
}): string {
  const planBlock = args.draftPlan
    ? `Current plan document:\n\n${args.draftPlan}`
    : "No prior plan notes — work only from the structured fields above.";
  return `Trip:
- Title: ${args.title}
- Origin: ${args.origin}
- Primary destination: ${args.destination}
- Dates: ${args.start} → ${args.end} (${args.durationDays} days)

${planBlock}

Produce the "## Day-by-Day" section now.`;
}

function mergeDayByDay(plan: string | null, dayByDay: string): string {
  const cleaned = dayByDay.trim();
  if (!plan || plan.trim() === "") return cleaned + "\n";

  // If a Day-by-Day section already exists, replace from "## Day-by-Day" to the
  // next top-level heading (or end of doc). Otherwise append to the end.
  const sectionStart = plan.indexOf("## Day-by-Day");
  if (sectionStart === -1) {
    return `${plan.trimEnd()}\n\n${cleaned}\n`;
  }
  const after = plan.slice(sectionStart);
  const nextHeadingRel = after.search(/\n## (?!Day-by-Day)/);
  const sectionEnd = nextHeadingRel === -1 ? plan.length : sectionStart + nextHeadingRel + 1; // +1 to keep the leading \n
  return (
    `${plan.slice(0, sectionStart).trimEnd()}\n\n${cleaned}\n\n${plan.slice(sectionEnd).trimStart()}`.trimEnd() +
    "\n"
  );
}

export interface DetailedPlanResult {
  markdown: string;
  daysGenerated: number;
}

export async function generateDetailedPlan(tripId: string): Promise<DetailedPlanResult> {
  const [trip, draftPlan] = await Promise.all([getTripById(tripId), getTripDraftPlan(tripId)]);
  if (!trip) throw new Error(`Trip ${tripId} not found`);

  const start = new Date(trip.startDate).toISOString().slice(0, 10);
  const end = new Date(trip.endDate).toISOString().slice(0, 10);
  const durationDays = Math.max(
    1,
    Math.ceil(
      (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  );

  const userPrompt = buildUserPrompt({
    title: trip.title,
    origin: trip.originAirport,
    destination: trip.destinationCity ?? trip.destinationCountry ?? "the destination",
    start,
    end,
    durationDays,
    draftPlan,
  });

  logger.info({ tripId, durationDays }, "Generating detailed plan");
  const raw = await callLLM(SYSTEM_PROMPT, userPrompt);
  const dayByDay = raw
    .replace(/^```(?:markdown)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  const merged = mergeDayByDay(draftPlan, dayByDay);
  await updateTripDraftPlan(tripId, merged);

  const daysGenerated = (dayByDay.match(/^###\s+Day\b/gim) ?? []).length;
  return { markdown: merged, daysGenerated };
}
