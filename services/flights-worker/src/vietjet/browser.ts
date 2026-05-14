import { chromium, devices } from "playwright";
import { logger } from "../logger.js";

const WAF_COOKIE_NAME = "aws-waf-token";
const HOMEPAGE = "https://www.vietjetair.com/vi";
const TIMEOUT_MS = 90_000;
const API_CAPTURE_TIMEOUT_MS = 45_000;

export interface VietJetFlightResult {
  flightNumber: string;
  airline: string;
  departureTime: string; // "2026-07-01T07:00:00"
  arrivalTime: string;
  from: string;
  to: string;
  priceVnd: number;
  bookingLink: string;
}

export interface VietJetSearchResult {
  flights: VietJetFlightResult[];
  capturedAt: string;
  /** Base64 screenshot taken at the end of the flow (for debugging). */
  screenshotBase64?: string;
}

export async function searchVietJetFlights(
  origin: string,
  destination: string,
  departDate: string, // YYYY-MM-DD
): Promise<VietJetSearchResult> {
  const [year, month, day] = departDate.split("-").map(Number);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await doSearch(origin, destination, departDate, year!, month!, day!);
    } catch (err) {
      logger.warn({ attempt, err }, "VietJet browser search failed, will retry");
    }
  }
  return { flights: [], capturedAt: new Date().toISOString() };
}

async function doSearch(
  origin: string,
  destination: string,
  departDate: string,
  year: number,
  month: number,
  day: number,
): Promise<VietJetSearchResult> {
  const t0 = Date.now();
  logger.info({ origin, destination, departDate }, "Starting headless VietJet search");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-setuid-sandbox",
      "--disable-software-rasterizer",
    ],
  });

  let screenshot: string | undefined;

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
    let stepStart = Date.now();
    await page.goto(HOMEPAGE, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    await waitForCookie(context, WAF_COOKIE_NAME, 10_000);
    logger.info({ elapsed: Date.now() - stepStart }, "WAF cookie acquired");

    // ── 2. Dismiss cookie consent banner ─────────────────────────────────────
    stepStart = Date.now();
    await safeClick(page, page.getByRole("button", { name: /đồng ý/i }).first(), 5_000);
    logger.info({ elapsed: Date.now() - stepStart }, "Cookie banner dismissed");
    await page.waitForTimeout(400);

    // ── 3. Select departure airport ───────────────────────────────────────────
    logger.info({ origin }, "Selecting departure airport");
    stepStart = Date.now();

    const depInput = page.locator("input[placeholder='Điểm khởi hành']").first();
    if (await depInput.count() > 0) {
      await depInput.click({ force: true });
    } else {
      const inputs = await page.locator("input[type='text']").all();
      if (inputs.length > 0) {
        await inputs[0]!.click({ force: true });
      } else {
        const allInputs = await page.locator("input").all();
        if (allInputs.length > 0) {
          await allInputs[0]!.click({ force: true });
        } else {
          throw new Error("No input elements found on page");
        }
      }
    }
    await page.waitForTimeout(800);

    await dismissPromo(page);

    if (await depInput.count() > 0) {
      await depInput.fill(origin);
      await page.waitForTimeout(600);
    }
    await clickAirportItem(page, origin);
    logger.info({ elapsed: Date.now() - stepStart }, "Departure airport selected");

    // ── 4. Select arrival airport ─────────────────────────────────────────────
    logger.info({ destination }, "Selecting arrival airport");
    stepStart = Date.now();
    await dismissPromo(page);

    const arrInput = page.locator("input[placeholder='Điểm đến']").first();
    if (await arrInput.count() > 0) {
      await arrInput.fill(destination);
      await page.waitForTimeout(600);
    }
    await clickAirportItem(page, destination);
    logger.info({ elapsed: Date.now() - stepStart }, "Arrival airport selected");

    // ── 5. Calendar — set one-way + select date ──────────────────────────────
    logger.info({ departDate }, "Setting departure date");
    stepStart = Date.now();
    await dismissPromo(page);
    await setOnewayAndDate(page, year!, month!, day!);
    logger.info({ elapsed: Date.now() - stepStart }, "Date selection complete");

    // ── 6. Dismiss passenger modal ───────────────────────────────────────────
    logger.info("Dismissing passenger modal");
    stepStart = Date.now();
    await page.waitForTimeout(800);
    await dismissPromo(page);
    await dismissPassengerModal(page);
    logger.info({ elapsed: Date.now() - stepStart }, "Passenger modal dismissed");

    // ── 7. Submit ─────────────────────────────────────────────────────────────
    logger.info("Submitting search");
    stepStart = Date.now();
    const searchBtn = page.locator("button").filter({ hasText: /Tìm chuyến/i }).last();
    if (await searchBtn.count() > 0) {
      await searchBtn.click({ force: true });
    }
    logger.info({ elapsed: Date.now() - stepStart }, "Search submitted");

    // ── 8. Wait for API responses ─────────────────────────────────────────────
    logger.info("Waiting for flight data");
    const deadline = Date.now() + API_CAPTURE_TIMEOUT_MS;
    while (capturedFlightJson.length === 0 && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    logger.info({ captured: capturedFlightJson.length, totalElapsed: Date.now() - t0 }, "API capture complete");

    // Take a screenshot for debugging
    try {
      screenshot = (await page.screenshot()).toString("base64");
    } catch { /* ignore */ }

    if (capturedFlightJson.length > 0) {
      const flights = parseApiResponse(capturedFlightJson, origin, destination, departDate);
      logger.info({ count: flights.length }, "Parsed flights from API intercept");
      return { flights, capturedAt: new Date().toISOString(), screenshotBase64: screenshot };
    }

    return { flights: [], capturedAt: new Date().toISOString(), screenshotBase64: screenshot };
  } finally {
    await browser.close().catch(() => { /* browser already crashed */ });
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
  try {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const sau = btns.find((b) => (b.textContent ?? "").includes("sau"));
      if (sau) sau.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
  } catch { /* page crashed — skip promo dismissal */ }
}

/**
 * Click an airport option in the dropdown using JS-native matching.
 * Instead of iterating all divs via Playwright (which hangs with hundreds of elements),
 * we evaluate in the page context to find and click the matching item.
 */
async function clickAirportItem(
  page: import("playwright").Page,
  iataCode: string,
): Promise<void> {
  await page.waitForTimeout(500);

  const result = await page.evaluate((code) => {
    // Airport dropdown items can appear in multiple formats:
    // 1. Exact text: "HAN"
    // 2. Prefixed: "HAN - Noi Bai"
    // 3. With IATA in parens: "Noi Bai (HAN)"
    // 4. Inside li/div/span with data attributes
    const codeUpper = code.toUpperCase();

    // Try common dropdown item selectors
    const selectors = [
      "li[role='option']",
      "li.dropdown-item",
      "li.list-group-item",
      "div[role='option']",
      "div.dropdown-item",
      ".airport-item",
      ".location-item",
      "[data-iata]",
    ];

    let clicked = false;

    for (const sel of selectors) {
      if (clicked) break;
      const items = document.querySelectorAll(sel);
      for (const item of Array.from(items)) {
        const txt = (item.textContent ?? "").trim().toUpperCase();
        const iataAttr = (item as HTMLElement).dataset?.iata?.toUpperCase();
        if (
          iataAttr === codeUpper ||
          txt === codeUpper ||
          txt.startsWith(codeUpper + " ") ||
          txt.startsWith(codeUpper + "-") ||
          txt.includes(`(${codeUpper})`)
        ) {
          (item as HTMLElement).click();
          clicked = true;
          break;
        }
      }
    }

    // Fallback: search all elements with reasonable text content
    if (!clicked) {
      const allElements = document.querySelectorAll("li, div[role], span[role], button[role], a");
      for (const el of Array.from(allElements)) {
        const txt = (el.textContent ?? "").trim().toUpperCase();
        // Match items that start with the IATA code or contain it in parens
        if (
          (txt.startsWith(codeUpper + " ") || txt.startsWith(codeUpper + "-") || txt.includes(`(${codeUpper})`)) &&
          txt.length < 80
        ) {
          (el as HTMLElement).click();
          clicked = true;
          break;
        }
      }
    }

    return { clicked, selectorsTried: selectors.length };
  }, iataCode);

  if (!result.clicked) {
    throw new Error(`No airport dropdown item matching "${iataCode}" found (tried ${result.selectorsTried} selectors + fallback)`);
  }

  await page.waitForTimeout(800);
}

/** Switch to one-way via React native setter, then select calendar day. */
async function setOnewayAndDate(
  page: import("playwright").Page,
  year: number,
  month: number,
  day: number,
): Promise<void> {
  // Switch radio to one-way using native property setter (triggers React onChange)
  try {
    await page.evaluate(() => {
      const radio = document.querySelector('input[type="radio"][value="oneway"]') as HTMLInputElement | null;
      if (!radio) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
      if (setter) setter.call(radio, true);
      radio.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(500);
  } catch { /* radio not found or page crashed — skip */ }

  // Also click the visible "Một chiều" button to reinforce the state
  const onewayBtn = page.locator("button, label, span").filter({ hasText: /^Một chiều$/ }).first();
  if (await onewayBtn.count() > 0) {
    await onewayBtn.click({ force: true }).catch(() => { /* ignore */ });
    await page.waitForTimeout(400);
  }

  await selectCalendarDay(page, year, month, day);
}

/**
 * Navigate the calendar to target month and tap the day.
 * Uses JS-native approach to avoid Playwright locator overhead.
 */
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

  // Wait for calendar to appear
  await page.waitForTimeout(500);

  for (let attempt = 0; attempt < 13; attempt++) {
    const result = await page.evaluate(
      ({ yr, mo, dy, monthStr }) => {
        // Find calendar month containers — try multiple class patterns
        const monthSelectors = [".rdrMonth", ".calendar-month", "[class*='Month']"];
        let monthContainers: Element[] = [];
        for (const sel of monthSelectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            monthContainers = Array.from(els);
            break;
          }
        }

        // If no structured selectors match, look for elements containing month names
        if (monthContainers.length === 0) {
          // Look for headers that contain the year and month string
          const allHeaders = document.querySelectorAll("h3, h4, h5, span, div");
          for (const header of Array.from(allHeaders)) {
            const txt = (header.textContent ?? "").trim();
            if (txt.includes(String(yr)) && (txt.includes(monthStr) || txt.includes(`/${String(mo).padStart(2, "0")}/`))) {
              // Found the month header — get its parent container
              monthContainers = [header.closest(".rdrMonth, [class*='Month']") ?? header.parentElement ?? header];
              break;
            }
          }
        }

        for (const mc of monthContainers) {
          const headerText = (mc.textContent ?? "").trim();
          if (
            headerText.includes(String(yr)) &&
            (headerText.includes(monthStr) || headerText.includes(`/${String(mo).padStart(2, "0")}/`))
          ) {
            // Find the day button
            const dayBtns = mc.querySelectorAll("button");
            for (const btn of Array.from(dayBtns)) {
              const btnTxt = (btn.textContent ?? "").trim();
              const isDisabled = btn.classList.contains("rdrDayDisabled") ||
                btn.classList.contains("rdrDayPassive") ||
                btn.hasAttribute("disabled");
              if (btnTxt === String(dy) && !isDisabled) {
                // Try tapping the span inside first (more precise)
                const span = btn.querySelector(".rdrDayNumber span");
                if (span) {
                  (span as HTMLElement).click();
                  return { success: true, method: "span-click" };
                }
                (btn as HTMLElement).click();
                return { success: true, method: "btn-click" };
              }
            }
          }
        }

        return { success: false, monthCount: monthContainers.length };
      },
      { yr: year, mo: month, dy: day, monthStr: targetMonthStr },
    );

    if (result.success) {
      await page.waitForTimeout(700);
      logger.info({ year, month, day, method: (result as any).method }, "Calendar day selected");
      return;
    }

    // Navigate forward one month
    const nextClicked = await page.evaluate(() => {
      const nextSelectors = [
        ".rdrNextButton",
        "button[aria-label*='Next']",
        "button[aria-label*='next']",
        "button[aria-label*='Tiếp']",
        "button[class*='next']",
        "button.nav-next",
      ];
      for (const sel of nextSelectors) {
        const btn = document.querySelector(sel) as HTMLElement | null;
        if (btn) {
          btn.click();
          return true;
        }
      }
      // Fallback: look for any button with an arrow icon on the right
      const allBtns = document.querySelectorAll("button");
      for (const btn of Array.from(allBtns)) {
        const rect = btn.getBoundingClientRect();
        if (rect.width < 50 && rect.right > window.innerWidth * 0.7) {
          const svg = btn.querySelector("svg");
          if (svg) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!nextClicked) {
      logger.warn("No calendar next button found, breaking loop");
      break;
    }
    await page.waitForTimeout(400);
  }

  // Fallback: click the first active day matching the day number anywhere on page
  logger.warn({ day }, "Month not found in calendar, using first active day as fallback");
  try {
    const fallbackResult = await page.evaluate((dy) => {
      const dayBtns = document.querySelectorAll("button");
      for (const btn of Array.from(dayBtns)) {
        const txt = (btn.textContent ?? "").trim();
        const isDisabled = btn.classList.contains("rdrDayDisabled") ||
          btn.classList.contains("rdrDayPassive") ||
          btn.hasAttribute("disabled");
        if (txt === String(dy) && !isDisabled) {
          (btn as HTMLElement).click();
          return { success: true };
        }
      }
      return { success: false };
    }, day);

    if (fallbackResult.success) {
      await page.waitForTimeout(700);
      logger.info({ day }, "Fallback calendar day selected");
      return;
    }
  } catch { /* fallback failed */ }

  logger.error({ year, month, day }, "Failed to select any calendar day");
}

/** Close the "CHỌN HÀNH KHÁCH" (passenger selection) modal. */
async function dismissPassengerModal(page: import("playwright").Page): Promise<void> {
  // Try JS-native approach first — more reliable than Playwright locators
  try {
    const dismissed = await page.evaluate(() => {
      // Try aria-label close buttons
      for (const label of ["close", "Close", "đóng", "Đóng", "close modal"]) {
        const btn = document.querySelector(`button[aria-label='${label}']`) as HTMLElement | null;
        if (btn) { btn.click(); return true; }
      }

      // Look for close buttons near the top-right of any modal overlay
      const allBtns = document.querySelectorAll("button");
      for (const btn of Array.from(allBtns)) {
        const rect = btn.getBoundingClientRect();
        // Top-right area of viewport
        if (rect.top < 200 && rect.left > window.innerWidth * 0.6) {
          const hasIcon = btn.querySelector("svg") || btn.querySelector("img");
          const isClose = (btn.textContent ?? "").trim().length === 0 ||
            (btn.textContent ?? "").trim() === "×" ||
            (btn.textContent ?? "").trim() === "X" ||
            hasIcon;
          if (isClose) {
            btn.click();
            return true;
          }
        }
      }

      // Look for modal close buttons by common patterns
      const closeSelectors = [
        ".modal-close",
        "[data-dismiss='modal']",
        ".close-btn",
        "button.close",
        ".modal-header button:last-child",
      ];
      for (const sel of closeSelectors) {
        const btn = document.querySelector(sel) as HTMLElement | null;
        if (btn) { btn.click(); return true; }
      }

      return false;
    });

    if (dismissed) {
      await page.waitForTimeout(400);
      return;
    }
  } catch { /* page crashed — skip */ }

  // Fallback: Playwright locator approach
  for (const label of ["close", "Close", "đóng"]) {
    try {
      const btn = page.locator(`button[aria-label='${label}']`).first();
      if (await btn.count() > 0) {
        await btn.click({ force: true });
        await page.waitForTimeout(400);
        return;
      }
    } catch { /* not visible or page crashed */ }
  }
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
): VietJetFlightResult[] {
  const results: VietJetFlightResult[] = [];
  const routeKey = `${origin}-${destination}`;

  for (const resp of responses) {
    if (!resp || typeof resp !== "object") continue;
    const r = resp as Record<string, unknown>;
    if (r["status"] !== true) continue;

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

      for (const fo of fareOptions) {
        const validity = fo["fareValidity"] as Record<string, unknown> | undefined;
        if (validity?.["soldOut"] || validity?.["noFare"] || !validity?.["valid"]) continue;

        const bookingKey = fo["bookingKey"] as string | undefined;
        const fareCharges = fo["fareCharges"] as Array<Record<string, unknown>> | undefined;

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
        break;
      }
    }
  }

  const byFlight = new Map<string, VietJetFlightResult>();
  for (const r of results) {
    const existing = byFlight.get(r.flightNumber);
    if (!existing || r.priceVnd < existing.priceVnd) {
      byFlight.set(r.flightNumber, r);
    }
  }

  return Array.from(byFlight.values()).sort((a, b) => a.priceVnd - b.priceVnd);
}
