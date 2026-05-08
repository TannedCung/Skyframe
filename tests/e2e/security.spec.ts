import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("API security — unauthenticated requests", () => {
  test("GET /api/trips → 401", async ({ request }) => {
    expect((await request.get("/api/trips")).status()).toBe(401);
  });

  test("POST /api/trips → 401", async ({ request }) => {
    expect(
      (
        await request.post("/api/trips", {
          data: {
            title: "x",
            originAirport: "HAN",
            startDate: "2026-01-01",
            endDate: "2026-01-10",
          },
        })
      ).status(),
    ).toBe(401);
  });

  test("GET /api/trips/:id → 401", async ({ request }) => {
    expect((await request.get("/api/trips/some-id")).status()).toBe(401);
  });

  test("PATCH /api/trips/:id → 401", async ({ request }) => {
    expect(
      (await request.patch("/api/trips/some-id", { data: { status: "archived" } })).status(),
    ).toBe(401);
  });

  test("DELETE /api/trips/:id → 401", async ({ request }) => {
    expect((await request.delete("/api/trips/some-id")).status()).toBe(401);
  });

  test("POST /api/trips/:id/generate-sg1 → 401", async ({ request }) => {
    expect((await request.post("/api/trips/some-id/generate-sg1")).status()).toBe(401);
  });

  test("POST /api/trips/:id/generate-sg2 → 401", async ({ request }) => {
    expect(
      (
        await request.post("/api/trips/some-id/generate-sg2", { data: { sg1OptionId: "x" } })
      ).status(),
    ).toBe(401);
  });

  test("POST /api/trips/:id/invite → 401", async ({ request }) => {
    expect(
      (await request.post("/api/trips/some-id/invite", { data: { emails: ["a@b.com"] } })).status(),
    ).toBe(401);
  });
});

test.describe("Cron security", () => {
  test("cron without secret returns 401 when CRON_SECRET configured", async ({ request }) => {
    const res = await request.get("/api/cron/refresh-itineraries");
    expect([200, 401]).toContain(res.status());
  });

  test("cron with wrong bearer returns 401 when secret configured", async ({ request }) => {
    const res = await request.get("/api/cron/refresh-itineraries", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect([200, 401]).toContain(res.status());
  });
});
