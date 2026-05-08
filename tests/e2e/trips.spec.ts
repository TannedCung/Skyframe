import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("shows My Trips heading and New Trip button", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /my trips/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /\+ new trip/i })).toBeVisible();
  });

  test("New Trip button navigates to create form", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /\+ new trip/i }).click();
    await expect(page).toHaveURL("/trip/new");
    await expect(page.getByRole("heading", { name: /plan a new trip/i })).toBeVisible();
  });
});

test.describe("Create Trip", () => {
  test("submitting the form creates a trip and redirects to detail page", async ({ page }) => {
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

  test("missing required field prevents submission", async ({ page }) => {
    await page.goto("/trip/new");
    await page.getByLabel(/trip title/i).fill("No Origin Trip");
    await page.getByLabel(/start date/i).fill("2026-08-01");
    await page.getByLabel(/end date/i).fill("2026-08-10");
    // do NOT fill origin airport (required)
    await page.getByRole("button", { name: /create trip/i }).click();
    // HTML5 validation keeps user on the form page
    await expect(page).toHaveURL("/trip/new");
  });
});
