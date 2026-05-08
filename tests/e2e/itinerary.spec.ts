import { test, expect } from "@playwright/test";
import type { Itinerary } from "../../src/types";

const mockSg1Option = {
  id: "opt-1",
  entryCity: "Tokyo",
  exitCity: "Tokyo",
  theme: "Cultural Highlights",
  approximateDates: { start: "2026-08-01", end: "2026-08-07" },
  airports: { entry: "NRT", exit: "NRT" },
  description: "7-day cultural exploration of Tokyo",
};

const mockSg1Response = {
  options: [{ id: "sg1-opt-1", llm_raw_plan_json: mockSg1Option }],
};

test.describe("SG1 and SG2 itinerary flows", () => {
  let tripId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/trips", {
      data: {
        title: "E2E Itinerary Trip",
        originAirport: "HAN",
        destinationCity: "Tokyo",
        startDate: "2026-08-01",
        endDate: "2026-08-10",
        tripType: "round_trip",
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { trip: { id: string } };
    tripId = body.trip.id;
  });

  test("trip detail page renders trip info", async ({ page }) => {
    await page.goto(`/trip/${tripId}`);
    await expect(page.getByRole("heading", { name: /e2e itinerary trip/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/HAN/)).toBeVisible();
  });

  test("Regenerate SG1 shows trip options (LLM mocked)", async ({ page }) => {
    // Mock both GET (empty) and POST (returns options)
    await page.route(`**/api/trips/${tripId}/generate-sg1`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockSg1Response),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ options: [] }),
        });
      }
    });

    await page.goto(`/trip/${tripId}`);
    // Wait for page to finish loading (heading appears after loading state clears)
    await expect(page.getByRole("heading", { name: /trip options/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: /regenerate/i }).click();
    await expect(page.getByText(/cultural highlights/i)).toBeVisible({ timeout: 15000 });
  });

  test("selecting SG1 option enables Build Full Itinerary button", async ({ page }) => {
    // Mock all generate-sg1 requests with options
    await page.route(`**/api/trips/${tripId}/generate-sg1`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSg1Response),
      });
    });

    await page.goto(`/trip/${tripId}`);
    await expect(page.getByRole("heading", { name: /trip options/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: /regenerate/i }).click();
    await page.getByText(/cultural highlights/i).click();
    await expect(page.getByRole("button", { name: /build full itinerary/i })).toBeEnabled({
      timeout: 10000,
    });
  });

  test("building SG2 itinerary shows day-by-day plan (LLM + flights mocked)", async ({ page }) => {
    const mockItinerary: Partial<Itinerary> = {
      id: "mock-itinerary-id",
      tripId,
      version: 1,
      status: "current",
      parentVersionId: null,
      snapshotFlightDataJson: {
        outbound: {
          from: "HAN",
          to: "NRT",
          departureTime: "2026-08-01T23:20:00",
          arrivalTime: "2026-08-02T07:30:00",
          airline: "VN",
          flightNumber: "VN310",
          duration: 250,
        },
        totalPrice: 0,
        currency: "USD",
        bookingLink: "https://www.vietnamairlines.com",
        provider: "airlabs",
        priceAvailable: false,
      },
      itineraryJson: [
        {
          day: 1,
          date: "2026-08-01",
          location: "Hanoi → Tokyo",
          activities: ["Board VN310 at 23:20", "Night flight to Tokyo"],
          notes: "Arrive early morning on day 2",
        },
        {
          day: 2,
          date: "2026-08-02",
          location: "Tokyo",
          activities: ["Arrive NRT 07:30", "Check in hotel", "Explore Shinjuku"],
          notes: null,
        },
      ],
      cheapestTotalPrice: 0,
      currency: "USD",
      llmModel: "claude-sonnet-4-6",
      createdAt: new Date().toISOString() as unknown as Date,
    };

    await page.route(`**/api/trips/${tripId}/generate-sg1`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSg1Response),
      });
    });

    await page.route(`**/api/trips/${tripId}/generate-sg2`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ itinerary: mockItinerary }),
      });
    });

    await page.goto(`/trip/${tripId}`);
    await expect(page.getByRole("heading", { name: /trip options/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: /regenerate/i }).click();
    await expect(page.getByText(/cultural highlights/i)).toBeVisible({ timeout: 15000 });
    await page.getByText(/cultural highlights/i).click();
    await page.getByRole("button", { name: /build full itinerary/i }).click();

    await expect(page.getByTestId("itinerary-view")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Hanoi → Tokyo/i)).toBeVisible();
    await expect(page.getByText(/VN310/i).first()).toBeVisible();
  });
});
