import { test, expect } from "@playwright/test";

// These tests assume the app is running with a test user session.
// In CI, use the test credentials provider to sign in.

test.describe("Create Trip (API layer)", () => {
  test("POST /api/trips returns 401 without session", async ({ request }) => {
    const response = await request.post("/api/trips", {
      data: {
        title: "Test Trip",
        originAirport: "HAN",
        startDate: "2025-03-01",
        endDate: "2025-03-10",
      },
    });
    expect(response.status()).toBe(401);
  });

  test("GET /api/trips returns 401 without session", async ({ request }) => {
    const response = await request.get("/api/trips");
    expect(response.status()).toBe(401);
  });
});
