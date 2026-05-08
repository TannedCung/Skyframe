/**
 * Skyframe end-to-end test suite.
 *
 * Covers: auth/redirects, API security, trip CRUD, SG1/SG2 itinerary flows.
 * The setup project (tests/setup/auth.setup.ts) runs first and injects an
 * authenticated session cookie, so all non-auth tests run as a signed-in user.
 */
import { test, expect } from "@playwright/test";
import type { Itinerary } from "../../src/types";

// ─── Auth & public pages (no session) ─────────────────────────────────────

test.describe("Public pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("landing page renders with sign-in links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /skyframe/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /start planning/i })).toBeVisible();
  });

  test("login page shows Google sign-in button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/continue with google/i)).toBeVisible();
  });

  test("/dashboard redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/trip/:id redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/trip/some-trip-id");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/trip/new redirects to /login when unauthenticated", async ({ page }) => {
    await page.goto("/trip/new");
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── API security (no session) ────────────────────────────────────────────

test.describe("API security", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [method, path] of [
    ["GET", "/api/trips"],
    ["POST", "/api/trips"],
    ["GET", "/api/trips/some-id"],
    ["PATCH", "/api/trips/some-id"],
    ["DELETE", "/api/trips/some-id"],
    ["POST", "/api/trips/some-id/generate-sg1"],
    ["POST", "/api/trips/some-id/generate-sg2"],
    ["POST", "/api/trips/some-id/invite"],
    ["GET", "/api/settings"],
    ["PATCH", "/api/settings"],
  ] as const) {
    test(`${method} ${path} → 401`, async ({ request }) => {
      const res = await request.fetch(path, { method, data: {} });
      expect(res.status()).toBe(401);
    });
  }

  test("cron without secret → 401 or 200 (depends on env)", async ({ request }) => {
    const res = await request.get("/api/cron/refresh-itineraries");
    expect([200, 401]).toContain(res.status());
  });

  test("cron with wrong bearer → 401 or 200 (depends on env)", async ({ request }) => {
    const res = await request.get("/api/cron/refresh-itineraries", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect([200, 401]).toContain(res.status());
  });
});

// ─── Dashboard (authenticated) ────────────────────────────────────────────

test.describe("Dashboard", () => {
  test("shows My Trips heading and New Trip button", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /my trips/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /\+ new trip/i })).toBeVisible();
  });

  test("New Trip button navigates to /trip/new", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /\+ new trip/i }).click();
    await expect(page).toHaveURL("/trip/new");
    await expect(page.getByRole("heading", { name: /plan a new trip/i })).toBeVisible();
  });
});

// ─── Create trip ──────────────────────────────────────────────────────────

test.describe("Create Trip", () => {
  test("form creates trip and redirects to detail page", async ({ page }) => {
    await page.goto("/trip/new");
    await page.getByLabel(/trip title/i).fill("E2E Tokyo Trip");
    await page.getByLabel(/origin airport/i).fill("HAN");
    await page.getByLabel(/destination city/i).fill("Tokyo");
    await page.getByLabel(/start date/i).fill("2026-08-01");
    await page.getByLabel(/end date/i).fill("2026-08-10");
    await page.getByRole("button", { name: /create trip/i }).click();
    await expect(page).toHaveURL(/\/trip\/[a-f0-9-]+$/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: /e2e tokyo trip/i })).toBeVisible();
  });

  test("created trip appears on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/e2e tokyo trip/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("missing required field keeps user on form (HTML5 validation)", async ({ page }) => {
    await page.goto("/trip/new");
    await page.getByLabel(/trip title/i).fill("No Origin Trip");
    await page.getByLabel(/start date/i).fill("2026-08-01");
    await page.getByLabel(/end date/i).fill("2026-08-10");
    await page.getByRole("button", { name: /create trip/i }).click();
    await expect(page).toHaveURL("/trip/new");
  });
});

// ─── SG1 & SG2 itinerary flows ────────────────────────────────────────────

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
  options: [{ id: "sg1-db-uuid", llm_raw_plan_json: mockSg1Option }],
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

  test("Regenerate SG1 shows options", async ({ page }) => {
    await page.route(`**/api/trips/${tripId}/generate-sg1`, async (route) => {
      const body = route.request().method() === "POST" ? mockSg1Response : { options: [] };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await page.goto(`/trip/${tripId}`);
    await expect(page.getByRole("heading", { name: /trip options/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: /regenerate/i }).click();
    await expect(page.getByText(/cultural highlights/i)).toBeVisible({ timeout: 15000 });
  });

  test("selecting SG1 option enables Build Full Itinerary button", async ({ page }) => {
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

  test("SG2 build renders day-by-day itinerary", async ({ page }) => {
    const mockItinerary: Partial<Itinerary> = {
      id: "mock-itin-id",
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
          activities: ["Board VN310 at 23:20"],
          notes: "Night flight",
        },
        {
          day: 2,
          date: "2026-08-02",
          location: "Tokyo",
          activities: ["Arrive NRT 07:30", "Explore Shinjuku"],
          notes: null,
        },
      ],
      cheapestTotalPrice: 0,
      currency: "USD",
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
