/**
 * Opens VietJetAir in a visible browser, lets you perform a real search,
 * and prints every API call made to vietjet-api.vietjetair.com.
 *
 * Usage:
 *   npx tsx scripts/capture-vietjet-api.ts
 *
 * Then manually search for a flight in the browser window.
 * All API calls (URL, method, headers, body, response) are printed to stdout.
 * Press Ctrl+C to stop.
 */
import { chromium } from "@playwright/test";

const VJETAPI_HOST = "vietjet-api.vietjetair.com";

const browser = await chromium.launch({ headless: false }); // visible window
const context = await browser.newContext();
const page = await context.newPage();

console.log("\n=== VietJet API capture — perform a flight search in the browser ===\n");

// Log all network requests/responses to the VietJet API
page.on("request", (req) => {
  if (!req.url().includes(VJETAPI_HOST)) return;
  console.log(`\n→ ${req.method()} ${req.url()}`);
  const body = req.postData();
  if (body) console.log(`  Body: ${body}`);
  // Print relevant headers only
  const h = req.headers();
  for (const key of ["x-aws-waf-token", "x-device-id", "content-type", "authorization"]) {
    if (h[key]) console.log(`  ${key}: ${h[key]?.slice(0, 60)}...`);
  }
});

page.on("response", async (res) => {
  if (!res.url().includes(VJETAPI_HOST)) return;
  console.log(`← ${res.status()} ${res.url()}`);
  try {
    const body = await res.text();
    // Pretty-print first 800 chars
    try {
      const parsed = JSON.parse(body);
      console.log(`  Response: ${JSON.stringify(parsed, null, 2).slice(0, 800)}\n`);
    } catch {
      console.log(`  Response: ${body.slice(0, 400)}\n`);
    }
  } catch {
    // ignore
  }
});

await page.goto("https://www.vietjetair.com/vi/select-flight");
console.log("Browser opened. Search for a flight now.");
console.log("Waiting 3 minutes for you to interact... (Ctrl+C to stop early)\n");

await page.waitForTimeout(180_000);
await browser.close();
