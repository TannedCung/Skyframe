import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getTripById,
  updateTripStatus,
  deleteTrip,
  getTripDraftPlan,
} from "@/lib/db/queries/trips";
import { getCurrentItinerary, getItineraryHistory } from "@/lib/db/queries/itineraries";
import { getWatchersByTrip } from "@/lib/db/queries/notifications";
import { getMessagesForTrip } from "@/lib/db/queries/chat";
import { sql } from "@/lib/db/client";
import { apiError, Errors } from "@/lib/errors";
import type { SG1Option, TripStatus } from "@/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const { id } = await params;
    const trip = await getTripById(id);
    if (!trip) return apiError(Errors.notFound("Trip"));

    const userId = (session.user as { id?: string }).id;
    const watchers = await getWatchersByTrip(id);
    const isAllowed =
      trip.userId === userId || watchers.some((w) => w.email === session.user?.email);

    if (!isAllowed) return apiError(Errors.forbidden());

    const [currentItinerary, history, messages, draftPlan, rawOptions] = await Promise.all([
      getCurrentItinerary(id),
      getItineraryHistory(id),
      getMessagesForTrip(id),
      getTripDraftPlan(id),
      sql`SELECT llm_raw_plan_json, selected FROM trip_raw_options WHERE trip_id = ${id} ORDER BY created_at ASC`,
    ]);

    const sg1Options: SG1Option[] = rawOptions.map((r) => r["llm_raw_plan_json"] as SG1Option);
    const selectedRow = rawOptions.find((r) => r["selected"] === true);
    const selectedSg1Id = selectedRow ? (selectedRow["llm_raw_plan_json"] as SG1Option).id : null;

    return NextResponse.json({
      trip,
      currentItinerary,
      history,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      draftPlan,
      sg1Options,
      selectedSg1Id,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const { id } = await params;
    const trip = await getTripById(id);
    if (!trip) return apiError(Errors.notFound("Trip"));

    const userId = (session.user as { id?: string }).id;
    if (trip.userId !== userId) return apiError(Errors.forbidden());

    const body = (await request.json()) as { status?: TripStatus };
    if (body.status) await updateTripStatus(id, body.status);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return apiError(Errors.unauthorized());

    const { id } = await params;
    const userId = (session.user as { id?: string }).id;
    if (!userId) return apiError(Errors.unauthorized());

    await deleteTrip(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
