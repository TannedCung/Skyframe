import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, Errors } from "@/lib/errors";
import { createTrip } from "@/lib/db/queries/trips";
import { runTripPlannerAgent } from "@/lib/agent/trip-planner";
import type { ChatMessage } from "@/lib/agent/trip-planner";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return apiError(Errors.unauthorized());

  const body = (await req.json()) as { messages?: ChatMessage[]; tripId?: string };
  const messages: ChatMessage[] = body.messages ?? [];

  if (messages.length === 0) {
    return apiError(Errors.badRequest("At least one message is required"));
  }
  let tripId = body.tripId;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (data: unknown) => controller.enqueue(enc.encode(sseEvent(data)));

      try {
        if (!tripId) {
          const today = new Date().toISOString().slice(0, 10);
          const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
          const trip = await createTrip({
            userId,
            title: "Planning...",
            originAirport: "TBD",
            startDate: today,
            endDate: futureDate,
            status: "draft",
          });
          tripId = trip.id;
          emit({ type: "trip_created", tripId });
          logger.info({ tripId, userId }, "Draft trip created for chat session");
        }

        for await (const event of runTripPlannerAgent(messages, tripId, userId)) {
          emit(event);
          if (event.type === "done") break;
        }
      } catch (err) {
        logger.error({ err }, "Chat agent error");
        emit({ type: "error", message: "Something went wrong. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
