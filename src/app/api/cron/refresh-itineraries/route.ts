import { NextResponse } from "next/server";
import { getActiveTripsForRefresh, updateLastFlightRefresh } from "@/lib/db/queries/trips";
import {
  getCurrentItinerary,
  createItinerary,
  getNextVersion,
  supersedePreviousItineraries,
} from "@/lib/db/queries/itineraries";
import {
  getWatchersByTrip,
  createNotification,
  getUnsentNotifications,
  markNotificationSent,
} from "@/lib/db/queries/notifications";
import { getFlightProvider } from "@/lib/flights/factory";
import { callLLM, parseJsonFromLLM } from "@/lib/llm/provider";
import { SG2_UPDATE_SYSTEM_PROMPT, buildSG2UpdatePrompt } from "@/lib/llm/prompts/sg2";
import { sendEmail } from "@/lib/email/ses";
import { priceChangeEmail } from "@/lib/email/templates/price-change";
import { apiError, Errors } from "@/lib/errors";
import logger from "@/lib/logger";
import type { DayItinerary, FlightSnapshot } from "@/types";

const PRICE_CHANGE_THRESHOLD = 0.05; // 5%

export async function GET(request: Request): Promise<NextResponse> {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env["CRON_SECRET"];

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return apiError(Errors.unauthorized());
  }

  try {
    const trips = await getActiveTripsForRefresh();
    logger.info({ count: trips.length }, "Starting itinerary refresh");

    const results = await Promise.allSettled(trips.map((trip) => refreshTrip(trip.id)));

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // Send pending notifications
    await sendPendingNotifications();

    return NextResponse.json({ refreshed: succeeded, failed, total: trips.length });
  } catch (error) {
    return apiError(error);
  }
}

async function refreshTrip(tripId: string): Promise<void> {
  const current = await getCurrentItinerary(tripId);
  if (!current) return;

  const snapshot = current.snapshotFlightDataJson;
  const outbound = snapshot.outbound;

  // Re-fetch flight data
  const flights = await getFlightProvider().searchFlights({
    origin: outbound.from,
    destination: outbound.to,
    dateFrom: outbound.departureTime.split("T")[0]!,
    dateTo: outbound.departureTime.split("T")[0]!,
    roundTrip: !!snapshot.inbound,
    returnFrom: snapshot.inbound?.departureTime.split("T")[0],
    returnTo: snapshot.inbound?.departureTime.split("T")[0],
    preferenceCheapest: true,
    preferenceFlightTime: "any",
  });

  if (!flights.length) {
    logger.warn({ tripId }, "No flights found during refresh, skipping");
    await updateLastFlightRefresh(tripId);
    return;
  }

  const newFlight = flights[0]!;
  const hasSignificantChange = newFlight.priceAvailable
    ? detectPriceChange(current.cheapestTotalPrice, newFlight.price)
    : detectScheduleChange(
        current.snapshotFlightDataJson.outbound.departureTime,
        newFlight.outbound.departureTime,
      );

  if (!hasSignificantChange) {
    logger.debug(
      { tripId, provider: newFlight.provider },
      "No significant change, skipping update",
    );
    await updateLastFlightRefresh(tripId);
    return;
  }

  const changeDesc = newFlight.priceAvailable
    ? `price ${current.cheapestTotalPrice} → ${newFlight.price} ${newFlight.currency}`
    : `schedule shift detected`;
  logger.info({ tripId, changeDesc }, "Significant change detected, regenerating itinerary");

  // Regenerate itinerary with minimal diff
  const rawText = await callLLM(
    SG2_UPDATE_SYSTEM_PROMPT,
    buildSG2UpdatePrompt(current.itineraryJson, current.cheapestTotalPrice, flights),
  );

  let updatedDays: DayItinerary[];
  try {
    const parsed = parseJsonFromLLM<{ days: DayItinerary[] }>(rawText);
    updatedDays = parsed.days;
  } catch {
    updatedDays = current.itineraryJson;
  }

  const newSnapshot: FlightSnapshot = {
    outbound: newFlight.outbound,
    inbound: newFlight.inbound,
    totalPrice: newFlight.priceAvailable ? newFlight.price : current.cheapestTotalPrice,
    currency: newFlight.currency,
    bookingLink: newFlight.bookingLink,
    provider: newFlight.provider,
    priceAvailable: newFlight.priceAvailable,
  };

  const version = await getNextVersion(tripId);
  const newItinerary = await createItinerary({
    tripId,
    version,
    parentVersionId: current.id,
    itineraryJson: updatedDays,
    snapshotFlightDataJson: newSnapshot,
    cheapestTotalPrice: newSnapshot.totalPrice,
    currency: newFlight.currency,
  });

  await supersedePreviousItineraries(tripId, newItinerary.id);
  await updateLastFlightRefresh(tripId);

  // Queue notifications for all watchers
  const watchers = await getWatchersByTrip(tripId);
  await Promise.all(
    watchers.map((w) =>
      createNotification({
        tripId,
        watcherEmail: w.email,
        type: newFlight.priceAvailable ? "price_change" : "new_itinerary_version",
        payloadJson: newFlight.priceAvailable
          ? {
              oldPrice: current.cheapestTotalPrice,
              newPrice: newFlight.price,
              currency: newFlight.currency,
              newVersion: version,
            }
          : {
              changeType: "schedule",
              oldDepartureTime: current.snapshotFlightDataJson.outbound.departureTime,
              newDepartureTime: newFlight.outbound.departureTime,
              newVersion: version,
            },
      }),
    ),
  );
}

function detectPriceChange(oldPrice: number, newPrice: number): boolean {
  if (oldPrice === 0) return false;
  return Math.abs(newPrice - oldPrice) / oldPrice >= PRICE_CHANGE_THRESHOLD;
}

/** Returns true if departure time shifted by >30 minutes. */
function detectScheduleChange(oldDepTime: string, newDepTime: string): boolean {
  const oldMs = new Date(oldDepTime).getTime();
  const newMs = new Date(newDepTime).getTime();
  if (isNaN(oldMs) || isNaN(newMs)) return false;
  return Math.abs(newMs - oldMs) > 30 * 60 * 1000;
}

async function sendPendingNotifications(): Promise<void> {
  const notifications = await getUnsentNotifications();

  await Promise.allSettled(
    notifications.map(async (n) => {
      try {
        if (n.type === "price_change") {
          const payload = n.payloadJson as {
            oldPrice: number;
            newPrice: number;
            currency: string;
          };

          const { getTripById } = await import("@/lib/db/queries/trips");
          const trip = await getTripById(n.tripId);
          if (!trip) return;

          const content = priceChangeEmail({
            tripId: n.tripId,
            tripTitle: trip.title,
            oldPrice: payload.oldPrice,
            newPrice: payload.newPrice,
            currency: payload.currency ?? "USD",
          });

          await sendEmail({ to: n.watcherEmail, ...content });
        }

        await markNotificationSent(n.id);
      } catch (error) {
        logger.warn({ notificationId: n.id, error }, "Failed to send notification");
      }
    }),
  );
}
