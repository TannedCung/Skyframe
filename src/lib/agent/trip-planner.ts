import {
  LlmAgent,
  FunctionTool,
  InMemorySessionService,
  Runner,
  LLMRegistry,
  createEvent,
  createEventActions,
} from "@google/adk";
import type { Schema } from "@google/genai";
import { OpenAILlm } from "./openai_llm";
import {
  updateTripFields,
  updateTripStatus,
  getTripById,
  updateTripDraftPlan,
  getTripDraftPlan,
} from "@/lib/db/queries/trips";
import type { TripChatFields } from "@/lib/db/queries/trips";
import { getFlightProvider } from "@/lib/flights/factory";
import { generateDetailedPlan } from "./detailed-plan";
import logger from "@/lib/logger";

// Register OpenAI LLM once (idempotent)
LLMRegistry.register(OpenAILlm);

const APP_NAME = "skyframe";
const AGENT_NAME = "trip_planner";

const SYSTEM_PROMPT = `You are a friendly trip planning assistant for Skyframe. Your job is to help users plan trips conversationally.

You have a **working plan document** that the user sees alongside the chat. As you learn new details, keep this document up to date by calling \`draft_plan\` — it's the structured artifact of what you've gathered so far. Update it after every confirmed piece of information.

## Information to collect (ONE question per turn)
**MUST** (required before \`finalize_trip\`):
1. Primary destination — the main city. If the user mentions multiple cities, pick one as the trip's home base and capture the rest in the plan.
2. Travel dates — start and end (ask together).
3. Origin — city or airport code they're flying from.

**SHOULD ask if natural**:
- Number of travelers / who they're going with
- Must-have activities (e.g. skiing, diving, specific attractions)
- Budget vs comfort preference

## The draft_plan document
Keep it tidy markdown with these sections (omit any that have no info yet):
\`\`\`
# <Trip title>

## Travelers
- ...

## Destinations
- <primary city — home base>
- <additional cities or regions>

## Dates
- <start> → <end> (<duration>)

## Must-have activities
- ...

## Flights
- <flight summaries once searched>

## Notes
- <anything else worth remembering>
\`\`\`

## Rules
- Call \`save_trip_info\` immediately after the user confirms a structured field (destination, dates, origin, etc).
- Call \`draft_plan\` after each new confirmed detail, including soft info like "snow skiing is a must" or "going with partner".
- **Every \`draft_plan\` call MUST contain the COMPLETE plan**, not a section diff. Re-emit every section that already had content plus the new info. Never send a stub — the previous plan is REPLACED, not merged.
- Convert city names to IATA codes for the \`originAirport\` field: Hanoi→HAN, Ho Chi Minh City/Saigon→SGN, Bangkok→BKK, Tokyo→NRT, Osaka→KIX, Kyoto→KIX (no airport, use Osaka), Singapore→SIN.
- **Today is ${new Date().toISOString().slice(0, 10)}.** All trip dates MUST be in the future relative to today. Format dates as YYYY-MM-DD.
- Resolve relative dates carefully:
  - "next year" → calendar year ${new Date().getFullYear() + 1}.
  - "this December" / "this summer" → the next occurrence (rolls to next year if already past in the current year).
  - "Feb 10 to Feb 20" with no year → pick the SOONEST future occurrence of that window. If Feb has already passed this year, that's Feb of next year.
  - When in any doubt, confirm the year with the user before calling \`save_trip_info\`.
- Once all three MUST fields are set, call \`search_flights\` automatically and add a Flights section to the plan.
- Call \`finalize_trip\` ONLY when the user explicitly confirms (e.g. "Yes", "Let's go", "Book it", "Looks good"). Do NOT call finalize_trip on a trip that is already \`active\` — it has been finalized before and the user is back to refine.
- Keep chat responses concise — 1-3 sentences per turn. The plan document is where detail lives.

## Resumed trips
If the **Current trip state** below shows status \`active\` or an existing plan, the user is RETURNING to refine. Do not re-introduce yourself or re-ask the basics — the plan already captures them. Instead, acknowledge what they want to change and act on it (update the plan, re-search flights, expand the day-by-day, etc).

## Day-by-day itinerary
Once flights are confirmed and the user signals they're ready (e.g. "let's build the days", "what should we do each day", "plan it out", "looks good"), call \`generate_detailed_plan\` — a dedicated tool that produces and persists a full Day-by-Day section in the plan document. After it returns, give the user a 1-sentence acknowledgement and let them ask for tweaks.

Do NOT hand-write the Day-by-Day yourself via \`draft_plan\` — use the dedicated tool. It is heavier, only call it ONCE per "ready" signal. If the user asks for changes after, edit the relevant days via \`draft_plan\` rather than regenerating from scratch.`;

function buildInstruction(state: { status: string; hasPlan: boolean }): string {
  const planLine = state.hasPlan ? "yes — user is refining" : "no — fresh conversation";
  return `${SYSTEM_PROMPT}

## Current trip state
- status: ${state.status}
- plan present: ${planLine}`;
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string }
  | { type: "plan_update"; markdown: string }
  | { type: "done"; tripId: string; redirect?: string }
  | { type: "trip_created"; tripId: string };

function buildTools(tripId: string) {
  const saveTripInfo = new FunctionTool({
    name: "save_trip_info",
    description:
      "Save collected trip information. Call immediately when user confirms a piece of info.",
    parameters: {
      type: "object",
      properties: {
        destinationCity: { type: "string", description: "Destination city name" },
        destinationCountry: { type: "string", description: "Destination country" },
        originAirport: { type: "string", description: "Origin IATA airport code e.g. HAN" },
        startDate: { type: "string", description: "Departure date YYYY-MM-DD" },
        endDate: { type: "string", description: "Return date YYYY-MM-DD" },
        tripType: { type: "string", enum: ["round_trip", "one_way"] },
        preferenceCheapest: { type: "boolean" },
        preferenceFlightTime: { type: "string", enum: ["any", "day", "night"] },
        title: { type: "string", description: "Trip title (auto-generated if omitted)" },
      },
    } as unknown as Schema,
    execute: async (input: unknown) => {
      const f = input as TripChatFields;
      await updateTripFields(tripId, f);
      logger.debug({ tripId, fields: Object.keys(f) }, "trip fields saved");
      return { success: true };
    },
  });

  const searchFlights = new FunctionTool({
    name: "search_flights",
    description: "Search for available flights. Call once origin, destination, and dates are set.",
    parameters: {
      type: "object",
      required: ["origin", "destination", "dateFrom", "dateTo"],
      properties: {
        origin: { type: "string", description: "Departure IATA code" },
        destination: { type: "string", description: "Arrival IATA code" },
        dateFrom: { type: "string", description: "Departure date YYYY-MM-DD" },
        dateTo: {
          type: "string",
          description: "Return date YYYY-MM-DD (same as dateFrom for one-way)",
        },
        roundTrip: { type: "boolean" },
      },
    } as unknown as Schema,
    execute: async (input: unknown) => {
      const args = input as {
        origin: string;
        destination: string;
        dateFrom: string;
        dateTo: string;
        roundTrip?: boolean;
      };
      try {
        const provider = getFlightProvider();
        const results = await provider.searchFlights({
          origin: args.origin,
          destination: args.destination,
          dateFrom: args.dateFrom,
          dateTo: args.dateTo || args.dateFrom,
          roundTrip: args.roundTrip ?? false,
          preferenceCheapest: true,
          preferenceFlightTime: "any",
        });
        if (results.length === 0)
          return { flights: [], message: "No flights found for these dates." };
        return {
          flights: results.slice(0, 5).map((f) => ({
            flightNumber: f.outbound.flightNumber,
            departure: f.outbound.departureTime,
            arrival: f.outbound.arrivalTime,
            price: f.priceAvailable
              ? `${f.price.toLocaleString()} ${f.currency}`
              : "Price not available",
            bookingLink: f.bookingLink,
          })),
        };
      } catch (err) {
        logger.warn({ err }, "Flight search failed in agent tool");
        return {
          flights: [],
          message:
            "Flight search temporarily unavailable. Continue planning and check flights later.",
        };
      }
    },
  });

  const draftPlanTool = new FunctionTool({
    name: "draft_plan",
    description:
      "Write or update the full structured trip plan as markdown. Call this whenever new information is confirmed. Always pass the COMPLETE updated plan, not a diff — it replaces the previous version.",
    parameters: {
      type: "object",
      required: ["markdown"],
      properties: {
        markdown: {
          type: "string",
          description: "The full plan document in markdown.",
        },
      },
    } as unknown as Schema,
    execute: async (input: unknown) => {
      const { markdown } = input as { markdown: string };
      await updateTripDraftPlan(tripId, markdown);
      logger.debug({ tripId, length: markdown.length }, "draft plan saved");
      return { success: true, markdown };
    },
  });

  const generateDetailedPlanTool = new FunctionTool({
    name: "generate_detailed_plan",
    description:
      "Generate a complete Day-by-Day itinerary from the current plan and persist it. Call ONCE after all 3 MUST fields are set AND flights have been searched AND the user has signalled they're ready (e.g. 'looks good', 'plan the days', 'what should we do'). Do not call this on every turn — it is a heavy generation step.",
    parameters: { type: "object", properties: {} } as unknown as Schema,
    execute: async () => {
      try {
        const result = await generateDetailedPlan(tripId);
        logger.info(
          { tripId, days: result.daysGenerated },
          "Detailed plan generated by agent tool",
        );
        return { success: true, markdown: result.markdown, daysGenerated: result.daysGenerated };
      } catch (err) {
        logger.error({ err, tripId }, "Detailed plan generation failed");
        return {
          success: false,
          error: "Detailed plan generation failed. Tell the user you'll try again in a moment.",
        };
      }
    },
  });

  const finalizeTrip = new FunctionTool({
    name: "finalize_trip",
    description: "Activate the trip after user confirmation. Triggers itinerary generation.",
    parameters: { type: "object", properties: {} } as unknown as Schema,
    execute: async () => {
      const trip = await getTripById(tripId);
      if (trip?.title === "Planning..." && trip.destinationCity) {
        await updateTripFields(tripId, { title: `${trip.destinationCity} Trip` });
      }
      await updateTripStatus(tripId, "active");
      logger.info({ tripId }, "Trip finalised by agent");
      return { redirect: `/trip/${tripId}` };
    },
  });

  return [saveTripInfo, searchFlights, draftPlanTool, generateDetailedPlanTool, finalizeTrip];
}

export async function* runTripPlannerAgent(
  messages: ChatMessage[],
  tripId: string,
  userId: string,
): AsyncGenerator<AgentEvent> {
  if (messages.length === 0) return;

  // Load trip state to inject runtime context into the instruction, and rehydrate
  // the draft plan so the UI shows it before the agent has run.
  const [trip, existingPlan] = await Promise.all([getTripById(tripId), getTripDraftPlan(tripId)]);
  if (existingPlan) {
    yield { type: "plan_update", markdown: existingPlan };
  }

  const agent = new LlmAgent({
    name: AGENT_NAME,
    model: "gpt-4o",
    instruction: buildInstruction({
      status: trip?.status ?? "draft",
      hasPlan: !!existingPlan,
    }),
    tools: buildTools(tripId),
  });

  const sessionService = new InMemorySessionService();
  const session = await sessionService.createSession({
    appName: APP_NAME,
    userId,
    sessionId: tripId,
  });

  // Pre-populate session with all prior messages (everything except the last one)
  const history = messages.slice(0, -1);
  for (let i = 0; i < history.length; i++) {
    const msg = history[i]!;
    const event = createEvent({
      invocationId: `hist_${i}`,
      author: msg.role === "user" ? "user" : AGENT_NAME,
      content: {
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      },
      actions: createEventActions(),
    });
    await sessionService.appendEvent({ session, event });
  }

  const runner = new Runner({ appName: APP_NAME, agent, sessionService });
  const lastMsg = messages[messages.length - 1]!;
  const newMessage = { role: "user" as const, parts: [{ text: lastMsg.content }] };

  let finalized = false;

  for await (const event of runner.runAsync({
    userId,
    sessionId: tripId,
    newMessage,
  })) {
    if (!event.content?.parts) continue;

    for (const part of event.content.parts) {
      // Stream text deltas from the model
      if (part.text && event.author === AGENT_NAME) {
        yield { type: "text", delta: part.text };
      }

      // Notify about tool calls
      if (part.functionCall && event.author === AGENT_NAME) {
        yield { type: "tool_call", name: part.functionCall.name ?? "" };
      }

      // Forward tool responses we care about
      if (part.functionResponse) {
        const fr = part.functionResponse as {
          name?: string;
          response?: { redirect?: string; markdown?: string };
        };
        if (
          (fr.name === "draft_plan" || fr.name === "generate_detailed_plan") &&
          typeof fr.response?.markdown === "string"
        ) {
          yield { type: "plan_update", markdown: fr.response.markdown };
        }
        if (fr.name === "finalize_trip" && fr.response?.redirect) {
          finalized = true;
          yield { type: "done", tripId, redirect: fr.response.redirect };
          return;
        }
      }
    }
  }

  if (!finalized) {
    yield { type: "done", tripId };
  }
}
