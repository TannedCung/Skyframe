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
import { apiError, Errors } from "@/lib/errors";
import type { TripStatus } from "@/types";

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

    const [currentItinerary, history, messages, draftPlan] = await Promise.all([
      getCurrentItinerary(id),
      getItineraryHistory(id),
      getMessagesForTrip(id),
      getTripDraftPlan(id),
    ]);

    return NextResponse.json({
      trip,
      currentItinerary,
      history,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      draftPlan,
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
