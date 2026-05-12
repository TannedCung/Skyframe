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
import { updateTripFields, updateTripStatus, getTripById } from "@/lib/db/queries/trips";
import type { TripChatFields } from "@/lib/db/queries/trips";
import { getFlightProvider } from "@/lib/flights/factory";
import logger from "@/lib/logger";

// Register OpenAI LLM once (idempotent)
LLMRegistry.register(OpenAILlm);

const APP_NAME = "skyframe";
const AGENT_NAME = "trip_planner";

const SYSTEM_PROMPT = `You are a friendly trip planning assistant for Skyframe. Your job is to help users plan trips conversationally.

Collect information in this order, ONE question at a time:
1. **Destination city** — where they want to go
2. **Travel dates** — start and end date (ask for both together)
3. **Origin** — city or airport code they're flying from

Rules:
- Call save_trip_info IMMEDIATELY after each piece of info is confirmed
- Convert city names to IATA codes: Hanoi→HAN, Ho Chi Minh City/Saigon→SGN, Bangkok→BKK, Tokyo→NRT or HND, Singapore→SIN
- Format dates as YYYY-MM-DD
- Once you have all three MUST fields (destination, dates, origin), call search_flights automatically
- After showing flight results, ask ONE preference question if appropriate (budget vs comfort)
- Call finalize_trip ONLY when user explicitly confirms (e.g. "Yes", "Let's go", "Book it", "Looks good")
- Keep responses concise — 1-3 sentences max per turn`;

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; name: string }
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

  return [saveTripInfo, searchFlights, finalizeTrip];
}

export async function* runTripPlannerAgent(
  messages: ChatMessage[],
  tripId: string,
  userId: string,
): AsyncGenerator<AgentEvent> {
  if (messages.length === 0) return;

  const agent = new LlmAgent({
    name: AGENT_NAME,
    model: "gpt-4o",
    instruction: SYSTEM_PROMPT,
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

      // Detect finalize_trip completion
      if (part.functionResponse) {
        const fr = part.functionResponse as { name?: string; response?: { redirect?: string } };
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
