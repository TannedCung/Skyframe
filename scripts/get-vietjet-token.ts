#!/usr/bin/env npx tsx
/**
 * Fetches a fresh VietJetAir AWS WAF token using a headless browser.
 *
 * Usage:
 *   npx tsx scripts/get-vietjet-token.ts
 *   npx tsx scripts/get-vietjet-token.ts --write   # writes to .env.local automatically
 *
 * How it works:
 *   1. Opens vietjetair.com in headless Chromium (same browser as E2E tests)
 *   2. The AWS WAF JavaScript challenge runs and sets aws-waf-token in cookies
 *   3. We extract the cookie and print it (or write it to .env.local)
 *
 * Token lifetime: typically 4–8 hours. Re-run when VietJet starts returning 202s.
 */

import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const VIETJET_URL = "https://www.vietjetair.com/vi/select-flight";
const WAF_COOKIE_NAME = "aws-waf-token";
const TIMEOUT_MS = 30_000;

async function main() {
  const writeToEnv = process.argv.includes("--write");

  console.log("Launching headless browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    console.log(`Navigating to ${VIETJET_URL} ...`);
    await page.goto(VIETJET_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

    // Wait for the WAF challenge JS to set the cookie.
    // The cookie appears within a few seconds of page load.
    console.log("Waiting for WAF challenge to complete...");
    const deadline = Date.now() + TIMEOUT_MS;
    let wafToken: string | undefined;

    while (Date.now() < deadline) {
      const cookies = await context.cookies();
      const wafCookie = cookies.find((c) => c.name === WAF_COOKIE_NAME);
      if (wafCookie?.value) {
        wafToken = wafCookie.value;
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!wafToken) {
      // Fallback: try reading it from localStorage (some WAF versions store it there)
      wafToken = (await page.evaluate(
        () => localStorage.getItem("aws-waf-token") ?? undefined,
      )) as string | undefined;
    }

    if (!wafToken) {
      console.error("ERROR: WAF token not found after waiting. VietJet may have changed their challenge.");
      process.exit(1);
    }

    // Also grab the device ID from localStorage if present
    const deviceId =
      ((await page.evaluate(() => localStorage.getItem("vj_device_id"))) as string | null) ??
      undefined;

    console.log("\n✓ Token acquired successfully\n");
    console.log(`VIETJET_WAF_TOKEN=${wafToken}`);
    if (deviceId) console.log(`VIETJET_DEVICE_ID=${deviceId}`);

    if (writeToEnv) {
      patchEnvFile(wafToken, deviceId);
    } else {
      console.log("\nRun with --write to update .env.local automatically.");
      console.log("Or add the above lines to your .env.local / Vercel environment variables.");
    }
  } finally {
    await browser.close();
  }
}

function patchEnvFile(wafToken: string, deviceId?: string) {
  const envPath = path.join(process.cwd(), ".env.local");

  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  content = setEnvVar(content, "VIETJET_WAF_TOKEN", wafToken);
  if (deviceId) content = setEnvVar(content, "VIETJET_DEVICE_ID", deviceId);

  fs.writeFileSync(envPath, content, "utf8");
  console.log(`\n✓ Written to ${envPath}`);
}

function setEnvVar(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
