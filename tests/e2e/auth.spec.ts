import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Public pages and unauthenticated redirects", () => {
  test("landing page renders with sign-in links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /skyframe/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /start planning/i })).toBeVisible();
  });

  test("unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated /trip/:id redirects to /login", async ({ page }) => {
    await page.goto("/trip/some-trip-id");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated /trip/new redirects to /login", async ({ page }) => {
    await page.goto("/trip/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page shows Google sign-in button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/continue with google/i)).toBeVisible();
  });
});
