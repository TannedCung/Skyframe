/**
 * Skyframe end-to-end test suite.
 *
 * Covers: auth/redirects, API security, trip CRUD, SG1/SG2 itinerary flows.
 * The setup project (tests/setup/auth.setup.ts) runs first and injects an
 * authenticated session cookie, so all non-auth tests run as a signed-in user.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

function loadEnvFile(p: string): Record<string, string> {
  if (!fs.existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function dbClient() {
  const env = loadEnvFile(path.resolve(__dirname, "../../.env.local"));
  const url = env["DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
  if (!url) throw new Error("DATABASE_URL missing for e2e DB seeding");
  return neon(url);
}

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

  test("New Trip button navigates to /trip/new and shows chat", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /\+ new trip/i }).click();
    await expect(page).toHaveURL("/trip/new");
    await expect(page.getByText(/where would you like to go/i)).toBeVisible();
  });
});

// ─── Create trip via chat ────────────────────────────────────────────────

const SKI_TRIP_PROMPT =
  "hello, I would like to plan up a trip with my gf around Feb next year to Tokyo. " +
  "We would like to visit the south (Kyoto, Osaka ...) And Tokyo. " +
  "Snow ski is a must in the itinerary";

const SKI_PLAN_MARKDOWN = `# Japan Ski Trip (Feb 2027)

## Travelers
- 2 people — you and your partner

## Destinations
- Tokyo (home base)
- Kyoto
- Osaka

## Dates
- 2027-02-10 → 2027-02-20 (10 nights)

## Must-have activities
- Snow skiing — likely Hakuba or Nozawa Onsen day trip

## Notes
- South Japan loop after a few days in Tokyo
`;

function sse(events: unknown[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

async function stubChatRoute(page: Page, events: unknown[]): Promise<void> {
  await page.route("**/api/trips/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse(events),
    });
  });
}

test.describe("Create Trip via chat", () => {
  test("initial state shows greeting, chat input, no plan panel", async ({ page }) => {
    await page.goto("/trip/new");
    await expect(page.getByText(/where would you like to go/i)).toBeVisible();
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("plan-panel")).toHaveCount(0);
  });

  test("multi-destination ski prompt drafts a plan into split view", async ({ page }) => {
    await stubChatRoute(page, [
      { type: "trip_created", tripId: "chat-fixture-1" },
      { type: "plan_update", markdown: SKI_PLAN_MARKDOWN },
      { type: "text", delta: "Love it! " },
      { type: "text", delta: "What city are you flying from?" },
      { type: "done", tripId: "chat-fixture-1" },
    ]);

    await page.goto("/trip/new");
    await page.getByTestId("chat-input").fill(SKI_TRIP_PROMPT);
    await page.getByTestId("chat-send").click();

    await expect(page.getByText(SKI_TRIP_PROMPT)).toBeVisible();
    await expect(page.getByText(/what city are you flying from/i)).toBeVisible({
      timeout: 5000,
    });

    const plan = page.getByTestId("plan-panel");
    await expect(plan).toBeVisible();
    await expect(plan).toContainText(/japan ski trip/i);
    await expect(plan).toContainText(/tokyo/i);
    await expect(plan).toContainText(/kyoto/i);
    await expect(plan).toContainText(/osaka/i);
    await expect(plan).toContainText(/snow skiing/i);
    await expect(plan).toContainText(/2 people/i);

    await expect(page.getByTestId("chat-input")).toHaveAttribute(
      "placeholder",
      /ctrl\+l to quote/i,
    );
  });

  test("Ctrl+L quotes selected plan text into chat input", async ({ page }) => {
    await stubChatRoute(page, [
      { type: "trip_created", tripId: "chat-fixture-2" },
      { type: "plan_update", markdown: SKI_PLAN_MARKDOWN },
      { type: "text", delta: "Got it. What city are you flying from?" },
      { type: "done", tripId: "chat-fixture-2" },
    ]);

    await page.goto("/trip/new");
    await page.getByTestId("chat-input").fill(SKI_TRIP_PROMPT);
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("plan-panel")).toBeVisible();

    // Select "Snow skiing" inside the plan panel.
    const selected = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="plan-content"]');
      if (!panel) return null;
      const target = "Snow skiing";
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const idx = node.textContent?.indexOf(target) ?? -1;
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + target.length);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          return sel?.toString() ?? null;
        }
      }
      return null;
    });
    expect(selected).toBe("Snow skiing");

    await page.keyboard.press("Control+l");

    await expect(page.getByTestId("chat-input")).toHaveValue(/^> Snow skiing/);
  });

  test("finalize_trip redirects to /trip/[id] and trip appears on dashboard", async ({
    page,
    request,
  }) => {
    // Pre-create a real trip we can redirect to.
    const res = await request.post("/api/trips", {
      data: {
        title: "E2E Chat Ski Trip",
        originAirport: "HAN",
        destinationCity: "Tokyo",
        startDate: "2027-02-10",
        endDate: "2027-02-20",
        tripType: "round_trip",
      },
    });
    expect(res.ok()).toBeTruthy();
    const { trip } = (await res.json()) as { trip: { id: string } };
    const tripId = trip.id;

    await stubChatRoute(page, [
      { type: "trip_created", tripId },
      { type: "plan_update", markdown: SKI_PLAN_MARKDOWN },
      { type: "text", delta: "Done — kicking off your itinerary." },
      { type: "done", tripId, redirect: `/trip/${tripId}` },
    ]);

    await page.goto("/trip/new");
    await page.getByTestId("chat-input").fill("yes, book it!");
    await page.getByTestId("chat-send").click();

    await expect(page).toHaveURL(new RegExp(`/trip/${tripId}$`), { timeout: 15000 });

    await page.goto("/dashboard");
    await expect(page.getByText(/e2e chat ski trip/i).first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Trip detail (chat-first, resumes from history) ──────────────────────

test.describe("Trip detail (chat resume)", () => {
  test("hydrates chat history and plan from DB on /trip/[id]", async ({ page, request }) => {
    const tripRes = await request.post("/api/trips", {
      data: {
        title: "E2E Resume Trip",
        originAirport: "HAN",
        destinationCity: "Tokyo",
        startDate: "2027-02-10",
        endDate: "2027-02-20",
        tripType: "round_trip",
      },
    });
    expect(tripRes.ok()).toBeTruthy();
    const { trip } = (await tripRes.json()) as { trip: { id: string } };
    const tripId = trip.id;

    // Seed chat history + draft plan directly so we can verify pure hydration.
    const sql = dbClient();
    const planMarkdown =
      "# Japan Ski Trip\n\n## Travelers\n- 2 people\n\n## Destinations\n- Tokyo\n- Kyoto\n- Osaka\n\n## Must-have activities\n- Snow skiing";
    await sql`UPDATE trips SET draft_plan = ${planMarkdown} WHERE id = ${tripId}`;
    await sql`INSERT INTO chat_messages (trip_id, role, content) VALUES (${tripId}, 'user', 'Plan a ski trip to Japan in Feb 2027')`;
    await sql`INSERT INTO chat_messages (trip_id, role, content) VALUES (${tripId}, 'model', 'Got it. What city are you flying from?')`;

    await page.goto(`/trip/${tripId}`);
    await expect(page.getByRole("heading", { name: /e2e resume trip/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/plan a ski trip to japan/i)).toBeVisible();
    await expect(page.getByText(/what city are you flying from/i)).toBeVisible();

    const plan = page.getByTestId("plan-panel");
    await expect(plan).toBeVisible();
    await expect(plan).toContainText(/japan ski trip/i);
    await expect(plan).toContainText(/snow skiing/i);

    // Default chat greeting should NOT show when history exists.
    await expect(page.getByText(/where would you like to go/i)).toHaveCount(0);
  });

  test("trip header shows status, destination, and date range", async ({ page, request }) => {
    const tripRes = await request.post("/api/trips", {
      data: {
        title: "E2E Header Trip",
        originAirport: "HAN",
        destinationCity: "Tokyo",
        startDate: "2027-02-10",
        endDate: "2027-02-20",
        tripType: "round_trip",
      },
    });
    const { trip } = (await tripRes.json()) as { trip: { id: string } };
    await page.goto(`/trip/${trip.id}`);
    await expect(page.getByRole("heading", { name: /e2e header trip/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/HAN.*Tokyo/i)).toBeVisible();
    await expect(page.getByText(/Round trip/i)).toBeVisible();
    // Old SG1/SG2 UI must be gone.
    await expect(page.getByRole("heading", { name: /trip options/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /build full itinerary/i })).toHaveCount(0);
  });
});
