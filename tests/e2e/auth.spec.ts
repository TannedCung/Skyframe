import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("landing page shows sign in link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /start planning/i })).toBeVisible();
  });

  test("unauthenticated user is redirected to login from dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user is redirected to login from trip detail", async ({ page }) => {
    await page.goto("/trip/some-trip-id");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders Google sign-in button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/continue with google/i)).toBeVisible();
  });
});
