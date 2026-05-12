import { NextResponse } from "next/server";
import { getFlightProvider } from "@/lib/flights/factory";
import { generateDetailedPlan } from "@/lib/agent/detailed-plan";
import logger from "@/lib/logger";

export const runtime = "nodejs";

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: unknown;
}

function ok(id: number | string | null, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: number | string | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

// ─── Tool schemas ──────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_flights",
    description: "Search for available flights between two airports on a given date.",
    inputSchema: {
      type: "object",
      required: ["origin", "destination", "date"],
      properties: {
        origin: { type: "string", description: "Departure IATA airport code (e.g. HAN)" },
        destination: { type: "string", description: "Arrival IATA airport code (e.g. BKK)" },
        date: { type: "string", description: "Travel date in YYYY-MM-DD format" },
        passengers: { type: "number", description: "Number of passengers (default 1)" },
        roundTrip: { type: "boolean", description: "Whether to search round-trip (default false)" },
      },
    },
  },
  {
    name: "list_providers",
    description: "List which flight data providers are currently configured and active.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "generate_detailed_plan",
    description:
      "Generate a Day-by-Day markdown itinerary for the trip and persist it into the trip's draft_plan. Call once all key trip info is collected (destination, dates, origin, optional flights).",
    inputSchema: {
      type: "object",
      required: ["tripId"],
      properties: {
        tripId: { type: "string", description: "UUID of the trip to generate a plan for" },
      },
    },
  },
];

// ─── Tool handlers ─────────────────────────────────────────────────────────────

async function handleSearchFlights(args: Record<string, unknown>) {
  const origin = String(args["origin"] ?? "").toUpperCase();
  const destination = String(args["destination"] ?? "").toUpperCase();
  const date = String(args["date"] ?? "");
  const roundTrip = Boolean(args["roundTrip"] ?? false);

  if (!origin || !destination || !date) {
    throw new Error("origin, destination, and date are required");
  }

  const provider = getFlightProvider();
  const results = await provider.searchFlights({
    origin,
    destination,
    dateFrom: date,
    dateTo: date,
    roundTrip,
    preferenceCheapest: true,
    preferenceFlightTime: "any",
  });

  return results.map((f) => ({
    flightNumber: f.outbound.flightNumber,
    airline: f.outbound.airline,
    departure: f.outbound.departureTime,
    arrival: f.outbound.arrivalTime,
    price: f.price,
    currency: f.currency,
    priceAvailable: f.priceAvailable,
    bookingLink: f.bookingLink,
  }));
}

function handleListProviders() {
  return {
    kiwi: !!process.env["KIWI_API_KEY"],
    vietjet:
      !!process.env["VIETJET_TOKEN_SERVICE_URL"] && !!process.env["VIETJET_TOKEN_SERVICE_SECRET"],
    airlabs: !!process.env["AIRLABS_API_KEY"],
    google: process.env["GOOGLE_FLIGHTS_ENABLED"] === "true",
  };
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // Bearer auth
  const authHeader = request.headers.get("authorization") ?? "";
  const expectedKey = process.env["SKYFRAME_MCP_API_KEY"];
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return rpcError(null, -32001, "Unauthorized");
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id, method } = body;
  logger.info({ method }, "MCP request");

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "skyframe-mcp", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const params = body.params as
      | { name?: string; arguments?: Record<string, unknown> }
      | undefined;
    const toolName = params?.name;
    const toolArgs = params?.arguments ?? {};

    try {
      if (toolName === "search_flights") {
        const result = await handleSearchFlights(toolArgs);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      }

      if (toolName === "list_providers") {
        const result = handleListProviders();
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      }

      if (toolName === "generate_detailed_plan") {
        const tripId = String(toolArgs["tripId"] ?? "");
        if (!tripId) throw new Error("tripId is required");
        const result = await generateDetailedPlan(tripId);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      }

      return rpcError(id, -32602, `Unknown tool: ${toolName ?? "(none)"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool execution failed";
      logger.error({ toolName, err }, "MCP tool error");
      return rpcError(id, -32603, message);
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}
