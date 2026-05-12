import { chromium, devices } from "playwright";
import { logger } from "./logger";

const WAF_COOKIE_NAME = "aws-waf-token";
const HOMEPAGE = "https://www.vietjetair.com/vi";
const TIMEOUT_MS = 90_000;

export interface FlightResult {
  flightNumber: string;
  airline: string;
  departureTime: string; // "2026-07-01T07:00:00"
  arrivalTime: string;
  from: string;
  to: string;
  priceVnd: number;
  bookingLink: string;
}

export interface SearchResult {
  flights: FlightResult[];
  capturedAt: string;
}

export async function searchFlights(
  origin: string,
  destination: string,
  departDate: string, // YYYY-MM-DD
): Promise<SearchResult> {
  logger.info({ origin, destination, departDate }, "Starting headless VietJet search");

  const [year, month, day] = departDate.split("-").map(Number);

  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });

  try {
    const context = await browser.newContext({
      ...devices["iPhone 12 Pro"],
      locale: "vi-VN",
    });

    const capturedFlightJson: unknown[] = [];
    context.on("response", async (res) => {
      if (
        res.url().includes("vietjet-api.vietjetair.com") &&
        res.url().includes("search-flight") &&
        res.status() === 200
      ) {
        try {
          const body = await res.json();
          capturedFlightJson.push(body);
          logger.info({ url: res.url().split("?")[0] }, "Captured VietJet API response");
        } catch { /* ignore */ }
      }
    });

    const page = await context.newPage();

    // ── 1. Homepage → WAF cookie ──────────────────────────────────────────────
    await page.goto(HOMEPAGE, { waitUntil: "networkidle", timeout: TIMEOUT_MS });
    await waitForCookie(context, WAF_COOKIE_NAME, 20_000);
    logger.info("WAF cookie acquired");

    // ── 2. Dismiss cookie consent banner ─────────────────────────────────────
    await safeClick(page, page.getByRole("button", { name: /đồng ý/i }).first(), 5_000);
    logger.info("Cookie banner dismissed");
    await page.waitForTimeout(800);

    // ── 3. Select departure airport ───────────────────────────────────────────
    logger.info({ origin }, "Selecting departure airport");
    const inputs = await page.locator("input[type='text']").all();
    await inputs[0]!.click({ force: true });
    await page.waitForTimeout(1_500);

    // Dismiss promo popup inside the airport modal
    await dismissPromo(page);

    // Type IATA code and pick from dropdown
    const depModal = page.locator("input[placeholder='Điểm khởi hành']").first();
    if (await depModal.count() > 0) {
      await depModal.fill(origin);
      await page.waitForTimeout(1_200);
    }
    await clickAirportDiv(page, origin);
    await page.waitForTimeout(1_000);
    logger.info({ origin }, "Departure airport selected");

    // ── 4. Select arrival airport ─────────────────────────────────────────────
    logger.info({ destination }, "Selecting arrival airport");
    await dismissPromo(page);

    const arrModal = page.locator("input[placeholder='Điểm đến']").first();
    if (await arrModal.count() > 0) {
      await arrModal.fill(destination);
      await page.waitForTimeout(1_200);
    }
    await clickAirportDiv(page, destination);
    await page.waitForTimeout(1_000);
    logger.info({ destination }, "Arrival airport selected");

    // ── 5. Calendar is now auto-open — set one-way + select date ─────────────
    logger.info({ departDate }, "Setting departure date (calendar auto-opened)");
    await dismissPromo(page);
    await setOnewayAndDate(page, year!, month!, day!);

    // ── 6. Dismiss passenger modal that auto-opens after date selection ───────
    logger.info("Dismissing passenger modal");
    await page.waitForTimeout(1_500);
    await dismissPromo(page);
    await dismissPassengerModal(page);

    // ── 7. Submit ─────────────────────────────────────────────────────────────
    logger.info("Submitting search");
    const searchBtn = page.locator("button").filter({ hasText: /Tìm chuyến/i }).last();
    if (await searchBtn.count() > 0) {
      await searchBtn.click({ force: true });
    }

    // ── 8. Wait for API responses (up to 45 s) ───────────────────────────────
    logger.info("Waiting for flight data");
    const deadline = Date.now() + 45_000;
    while (capturedFlightJson.length === 0 && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    logger.info({ captured: capturedFlightJson.length }, "API capture complete");

    if (capturedFlightJson.length > 0) {
      const flights = parseApiResponse(capturedFlightJson, origin, destination, departDate);
      logger.info({ count: flights.length }, "Parsed flights from API intercept");
      return { flights, capturedAt: new Date().toISOString() };
    }

    return { flights: [], capturedAt: new Date().toISOString() };
  } finally {
    await browser.close();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function safeClick(
  page: import("playwright").Page,
  locator: import("playwright").Locator,
  timeoutMs: number,
): Promise<void> {
  try {
    if (await locator.isVisible({ timeout: timeoutMs })) {
      await locator.click();
      await page.waitForTimeout(400);
    }
  } catch { /* not visible — skip */ }
}

async function dismissPromo(page: import("playwright").Page): Promise<void> {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const sau = btns.find((b) => (b.textContent ?? "").includes("sau"));
    if (sau) sau.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
}

/** Click the exact-text IATA code div in the airport dropdown. */
async function clickAirportDiv(
  page: import("playwright").Page,
  iataCode: string,
): Promise<void> {
  const divItems = page.locator("div").filter({ hasText: new RegExp(`^\\s*${iataCode}\\s*$`) });
  const count = await divItems.count();
  for (let i = count - 1; i >= 0; i--) {
    const txt = ((await divItems.nth(i).textContent()) ?? "").trim();
    if (txt === iataCode) {
      await divItems.nth(i).click({ force: true, timeout: 5_000 });
      await page.waitForTimeout(800);
      return;
    }
  }
  throw new Error(`No airport div with exact text "${iataCode}"`);
}

/** Switch to one-way via React native setter, then tap the target calendar day. */
async function setOnewayAndDate(
  page: import("playwright").Page,
  year: number,
  month: number,
  day: number,
): Promise<void> {
  // Switch radio to one-way using native property setter (triggers React onChange)
  await page.evaluate(() => {
    const radio = document.querySelector('input[type="radio"][value="oneway"]') as HTMLInputElement | null;
    if (!radio) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
    if (setter) setter.call(radio, true);
    radio.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    radio.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(500);

  // Also click the visible "Một chiều" button to reinforce the state
  const onewayBtn = page.locator("button, label, span").filter({ hasText: /^Một chiều$/ }).first();
  if (await onewayBtn.count() > 0) {
    await onewayBtn.click({ force: true }).catch(() => { /* ignore */ });
    await page.waitForTimeout(400);
  }

  // Find the correct month in the calendar and tap the target day
  await selectCalendarDay(page, year, month, day);
}

/** Navigate the react-date-range calendar to target month and tap the day. */
async function selectCalendarDay(
  page: import("playwright").Page,
  year: number,
  month: number,
  day: number,
): Promise<void> {
  const vjMonthNames = [
    "", "Tháng Một", "Tháng Hai", "Tháng Ba", "Tháng Tư", "Tháng Năm", "Tháng Sáu",
    "Tháng Bảy", "Tháng Tám", "Tháng Chín", "Tháng Mười", "Tháng Mười Một", "Tháng Mười Hai",
  ];
  const targetMonthStr = vjMonthNames[month]!;

  // Scroll calendar forward up to 12 times to find the target month
  for (let attempt = 0; attempt < 13; attempt++) {
    // Check all visible rdrMonth containers
    const monthContainers = await page.locator(".rdrMonth").all();
    for (const mc of monthContainers) {
      const headerText = (await mc.locator(".rdrMonthAndYearWrapper").textContent().catch(() => "")) ?? "";
      if (
        headerText.includes(String(year)) &&
        (headerText.includes(targetMonthStr) || headerText.includes(`/${String(month).padStart(2, "0")}/`))
      ) {
        // Target month found — click the target day
        const dayBtn = mc
          .locator("button.rdrDay:not(.rdrDayDisabled):not(.rdrDayPassive)")
          .filter({ hasText: new RegExp(`^${day}$`) })
          .first();
        if (await dayBtn.count() > 0) {
          const innerSpan = dayBtn.locator(".rdrDayNumber span").first();
          try {
            if (await innerSpan.count() > 0) {
              await innerSpan.tap();
            } else {
              await dayBtn.tap();
            }
          } catch {
            await dayBtn.click({ force: true });
          }
          await page.waitForTimeout(700);
          logger.info({ year, month, day }, "Calendar day selected");
          return;
        }
      }
    }

    // Month not in view — navigate forward
    const nextBtn = page.locator(".rdrNextButton, button[class*='next'], button[aria-label*='Next'], button[aria-label*='next']").first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click({ force: true });
      await page.waitForTimeout(350);
    } else {
      break;
    }
  }

  // Fallback: click the first active day matching the day number
  logger.warn({ day }, "Month not found in calendar, using first active day");
  const fallbackBtn = page
    .locator("button.rdrDay:not(.rdrDayDisabled):not(.rdrDayPassive)")
    .filter({ hasText: new RegExp(`^${day}$`) })
    .first();
  if (await fallbackBtn.count() > 0) {
    const innerSpan = fallbackBtn.locator(".rdrDayNumber span").first();
    try {
      await (await innerSpan.count() > 0 ? innerSpan : fallbackBtn).tap();
    } catch {
      await fallbackBtn.click({ force: true });
    }
    await page.waitForTimeout(700);
  }
}

/** Close the "CHỌN HÀNH KHÁCH" (passenger selection) modal that auto-opens after date selection. */
async function dismissPassengerModal(page: import("playwright").Page): Promise<void> {
  // Try aria-label close button first (most reliable)
  for (const label of ["close", "Close", "đóng"]) {
    const btn = page.locator(`button[aria-label='${label}']`).first();
    if (await btn.count() > 0) {
      await btn.click({ force: true });
      await page.waitForTimeout(400);
      return;
    }
  }
  // Fallback: JS click on SVG button in the top-right area
  await page.evaluate(() => {
    const btns = document.querySelectorAll("button");
    for (const btn of btns) {
      const rect = btn.getBoundingClientRect();
      if (rect.top < 200 && rect.left > 300 && btn.querySelector("svg")) {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return;
      }
    }
  });
  await page.waitForTimeout(400);
}

async function waitForCookie(
  context: import("playwright").BrowserContext,
  name: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cookies = await context.cookies();
    if (cookies.some((c) => c.name === name)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ─── API response parsing ─────────────────────────────────────────────────────

function parseApiResponse(
  responses: unknown[],
  origin: string,
  destination: string,
  departDate: string,
): FlightResult[] {
  const results: FlightResult[] = [];
  const routeKey = `${origin}-${destination}`;

  for (const resp of responses) {
    if (!resp || typeof resp !== "object") continue;
    const r = resp as Record<string, unknown>;
    if (r["status"] !== true) continue;

    // Shape: { status: true, travelOption: { "HAN-SGN": [...] }, sessionId: "..." }
    const travelOption = r["travelOption"] as Record<string, unknown> | undefined;
    const sessionId = r["sessionId"] as string | undefined;

    if (!travelOption) continue;

    const options = travelOption[routeKey] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(options)) continue;

    for (const opt of options) {
      const flights = opt["flights"] as Array<Record<string, unknown>> | undefined;
      const fareOptions = opt["fareOptions"] as Array<Record<string, unknown>> | undefined;
      if (!flights?.length || !fareOptions?.length) continue;

      const flight = flights[0]!;
      const airlineCode = ((flight["airlineCode"] as Record<string, unknown> | undefined)?.["code"] as string) ?? "VJ";
      const flightNumber = (flight["flightNumber"] as string | undefined) ?? "";

      const dep = flight["departure"] as Record<string, unknown> | undefined;
      const arr = flight["arrival"] as Record<string, unknown> | undefined;
      const depTime = (dep?.["localScheduledTime"] as string | undefined)?.replace(" ", "T") ?? "";
      const arrTime = (arr?.["localScheduledTime"] as string | undefined)?.replace(" ", "T") ?? "";

      if (!depTime || !arrTime) continue;

      // Find the cheapest valid fare option
      for (const fo of fareOptions) {
        const validity = fo["fareValidity"] as Record<string, unknown> | undefined;
        if (validity?.["soldOut"] || validity?.["noFare"] || !validity?.["valid"]) continue;

        const bookingKey = fo["bookingKey"] as string | undefined;
        const fareCharges = fo["fareCharges"] as Array<Record<string, unknown>> | undefined;

        // Find the base fare charge (chargeType.code === "FA")
        const fareCharge = fareCharges?.find((c) => {
          const ct = c["chargeType"] as Record<string, unknown> | undefined;
          return ct?.["code"] === "FA";
        });

        const currAmounts = fareCharge?.["currencyAmounts"] as Array<Record<string, unknown>> | undefined;
        const totalAmount = (currAmounts?.[0]?.["totalAmount"] as number | undefined) ?? 0;
        if (!totalAmount) continue;

        const bookingLink = sessionId && bookingKey
          ? `https://www.vietjetair.com/vi/select-flight?sessionId=${encodeURIComponent(sessionId)}&bookingKey=${encodeURIComponent(bookingKey)}`
          : `https://www.vietjetair.com/vi/select-flight?departAirport=${origin}&arrivalAirport=${destination}&departDate=${departDate}`;

        results.push({
          flightNumber: `${airlineCode}${flightNumber}`,
          airline: airlineCode,
          departureTime: depTime,
          arrivalTime: arrTime,
          from: origin,
          to: destination,
          priceVnd: totalAmount,
          bookingLink,
        });
        break; // cheapest fare per flight option
      }
    }
  }

  // Deduplicate by flightNumber, keep cheapest
  const byFlight = new Map<string, FlightResult>();
  for (const r of results) {
    const existing = byFlight.get(r.flightNumber);
    if (!existing || r.priceVnd < existing.priceVnd) {
      byFlight.set(r.flightNumber, r);
    }
  }

  return Array.from(byFlight.values()).sort((a, b) => a.priceVnd - b.priceVnd);
}
