import { test, expect } from "@playwright/test";

test.describe("SG1/SG2 API security", () => {
  test("POST generate-sg1 returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/trips/some-id/generate-sg1");
    expect(res.status()).toBe(401);
  });

  test("POST generate-sg2 returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/trips/some-id/generate-sg2", {
      data: { sg1OptionId: "opt-1" },
    });
    expect(res.status()).toBe(401);
  });
});
