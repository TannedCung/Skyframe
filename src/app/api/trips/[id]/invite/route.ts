import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTripById } from "@/lib/db/queries/trips";
import {
  upsertWatcher,
  createNotification,
  getWatchersByTrip,
} from "@/lib/db/queries/notifications";
import { getCurrentItinerary } from "@/lib/db/queries/itineraries";
import { sendEmail } from "@/lib/email/ses";
import { inviteEmail } from "@/lib/email/templates/invite";
import { apiError, Errors } from "@/lib/errors";

export async function POST(
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

    const body = (await request.json()) as { emails?: string[] };
    if (!body.emails?.length) return apiError(Errors.badRequest("emails array is required"));

    const currentItinerary = await getCurrentItinerary(id);
    const inviterName = session.user.name ?? session.user.email;

    const results = await Promise.allSettled(
      body.emails.map(async (email) => {
        const watcher = await upsertWatcher({ tripId: id, email, role: "viewer" });

        await createNotification({
          tripId: id,
          watcherEmail: email,
          type: "invite",
          payloadJson: { inviteToken: watcher.inviteToken },
        });

        const emailContent = inviteEmail({
          tripId: id,
          tripTitle: trip.title,
          destination: trip.destinationCity ?? trip.destinationCountry ?? "your destination",
          inviterName,
          inviteToken: watcher.inviteToken,
          startDate: trip.startDate.toISOString().split("T")[0]!,
          endDate: trip.endDate.toISOString().split("T")[0]!,
          price: currentItinerary?.cheapestTotalPrice ?? 0,
          currency: currentItinerary?.currency ?? "USD",
        });

        await sendEmail({ to: email, ...emailContent });

        return { email, inviteToken: watcher.inviteToken };
      }),
    );

    const invited = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<{ email: string; inviteToken: string }>).value);

    const failed = results.filter((r) => r.status === "rejected").map((_, i) => body.emails![i]);

    return NextResponse.json({ invited, failed });
  } catch (error) {
    return apiError(error);
  }
}

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
    if (trip.userId !== userId) return apiError(Errors.forbidden());

    const watchers = await getWatchersByTrip(id);
    return NextResponse.json({ watchers });
  } catch (error) {
    return apiError(error);
  }
}
