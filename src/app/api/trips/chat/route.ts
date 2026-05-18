import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, Errors } from "@/lib/errors";
import { createTrip } from "@/lib/db/queries/trips";
import { appendChatMessage } from "@/lib/db/queries/chat";
import { getUserById } from "@/lib/db/queries/users";
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

  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (data: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(enc.encode(sseEvent(data)));
        } catch {
          cancelled = true;
        }
      };

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

        // Persist the user's latest message before running the agent.
        const lastUserMessage = messages[messages.length - 1];
        if (lastUserMessage?.role === "user" && lastUserMessage.content.trim()) {
          await appendChatMessage(tripId, "user", lastUserMessage.content);
        }

        const user = await getUserById(userId);
        const gdsProvider = user?.gdsProvider ?? "auto";

        let assistantText = "";
        for await (const event of runTripPlannerAgent(messages, tripId, userId, gdsProvider)) {
          if (event.type === "text") assistantText += event.delta;
          emit(event);
          if (event.type === "done") break;
        }
        if (assistantText.trim()) {
          await appendChatMessage(tripId, "model", assistantText);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, message }, "Chat agent error");
        emit({
          type: "error",
          message:
            process.env["NODE_ENV"] === "production"
              ? "Something went wrong. Please try again."
              : message,
        });
      } finally {
        cancelled = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
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
