import { chromium, devices } from "playwright";
import { logger } from "../logger.js";

const WAF_COOKIE_NAME = "aws-waf-token";
const HOMEPAGE = "https://www.vietjetair.com/vi";
const TIMEOUT_MS = 90_000;
const API_CAPTURE_TIMEOUT_MS = 45_000;

export interface VietJetFlightResult {
  flightNumber: string;
  airline: string;
  departureTime: string;
  arrivalTime: string;
  from: string;
  to: string;
  priceVnd: number;
  bookingLink: string;
}

export interface VietJetSearchResult {
  flights: VietJetFlightResult[];
  capturedAt: string;
  screenshotBase64?: string;
}

export async function searchVietJetFlights(
  origin: string,
  destination: string,
  departDate: string,
): Promise<VietJetSearchResult> {
  const [year, month, day] = departDate.split("-").map(Number);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await doSearch(origin, destination, departDate, year!, month!, day!);
    } catch (err) {
      const errInfo = err instanceof Error ? { message: err.message, stack: err.stack } : { raw: String(err) };
      logger.warn({ attempt, ...errInfo }, "VietJet browser search failed, will retry");
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

    // ── 1. Homepage → wait for WAF cookie ─────────────────────────────────────
    let stepStart = Date.now();
    await page.goto(HOMEPAGE, { waitUntil: "networkidle", timeout: TIMEOUT_MS });
    const hasWaf = await waitForCookie(context, WAF_COOKIE_NAME, 10_000);
    if (!hasWaf) {
      logger.warn("WAF cookie not found after 10s, proceeding anyway");
    } else {
      logger.info({ elapsed: Date.now() - stepStart }, "WAF cookie acquired");
    }

    // ── 2. Dismiss cookie consent banner ─────────────────────────────────────
    stepStart = Date.now();
    await safeClick(page, page.getByRole("button", { name: /đồng ý/i }).first(), 5_000);
    logger.info({ elapsed: Date.now() - stepStart }, "Cookie banner dismissed");
    await page.waitForTimeout(500);

    // ── 3. Select airports via pressSequentially + dropdown click ───────────
    logger.info({ origin, destination }, "Selecting airports");
    stepStart = Date.now();

    await selectAirportsViaJS(page, origin, destination);

    logger.info({ elapsed: Date.now() - stepStart }, "Airports selected");

    // ── 4. Calendar — set one-way + select date ──────────────────────────────
    logger.info({ departDate }, "Setting departure date");
    stepStart = Date.now();
    await dismissPromo(page);
    await setOnewayAndDate(page, year!, month!, day!);
    logger.info({ elapsed: Date.now() - stepStart }, "Date selection complete");

    // ── 5. Dismiss passenger modal ───────────────────────────────────────────
    logger.info("Dismissing passenger modal");
    stepStart = Date.now();
    await page.waitForTimeout(800);
    await dismissPromo(page);
    await dismissPassengerModal(page);
    logger.info({ elapsed: Date.now() - stepStart }, "Passenger modal dismissed");

    // ── 6. Submit ─────────────────────────────────────────────────────────────
    logger.info("Submitting search");
    stepStart = Date.now();
    const searchBtn = page.locator("button").filter({ hasText: /Tìm chuyến/i }).last();
    if (await searchBtn.count() > 0) {
      await searchBtn.click({ force: true });
    }
    logger.info({ elapsed: Date.now() - stepStart }, "Search submitted");

    // ── 7. Wait for API responses ─────────────────────────────────────────────
    logger.info("Waiting for flight data");
    const deadline = Date.now() + API_CAPTURE_TIMEOUT_MS;
    while (capturedFlightJson.length === 0 && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    logger.info({ captured: capturedFlightJson.length, totalElapsed: Date.now() - t0 }, "API capture complete");

    // Screenshot for debugging
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
 * Select departure and arrival airports using pressSequentially + JS dropdown click.
 */
async function selectAirportsViaJS(
  page: import("playwright").Page,
  origin: string,
  destination: string,
): Promise<void> {
  // Find the two text inputs — Material-UI with no placeholders.
  // First visible text input = departure, second = arrival.
  const textInputs = await page.locator("input[type='text']").all();
  if (textInputs.length < 2) {
    throw new Error(`Expected at least 2 text inputs, found ${textInputs.length}`);
  }

  const depInput = textInputs[0]!;
  const arrInput = textInputs[1]!;

  // ── Departure ──
  await depInput.click({ force: true });
  await page.waitForTimeout(600);
  await dismissPromo(page);
  await depInput.pressSequentially(origin, { delay: 100 });
  await page.waitForTimeout(2000);
  await clickDropdownItem(page, origin, "departure");
  await page.waitForTimeout(500);

  // ── Arrival ──
  await arrInput.click({ force: true });
  await page.waitForTimeout(600);
  await dismissPromo(page);
  await arrInput.pressSequentially(destination, { delay: 100 });
  await page.waitForTimeout(1000);
  await clickDropdownItem(page, destination, "arrival");
}

/** Click a dropdown item matching the IATA code using page.evaluate. */
async function clickDropdownItem(
  page: import("playwright").Page,
  iataCode: string,
  label: string,
): Promise<void> {
  const result = await page.evaluate((code) => {
    const codeUpper = code.toUpperCase();

    // Airport items on VietJet use JSS classes like jss778/jss779/jss780
    // which don't match any semantic selector. Search ALL visible divs and spans.
    const allItems = document.querySelectorAll(
      "li, [role='option'], .dropdown-item, .list-group-item, " +
      ".airport-item, .location-item, [data-iata], " +
      "div[class*='item'], div[class*='airport'], div[class*='location'], " +
      "div.jss, span.jss, [class*='MuiAutocomplete'], [class*='MuiPaper']"
    );

    // Also grab ALL divs and spans that have meaningful text (catches JSS classes)
    const allDivs = document.querySelectorAll("div, span, li, a");
    const combined = new Set([...Array.from(allItems), ...Array.from(allDivs)]);

    const debugTexts: string[] = [];
    for (const el of Array.from(combined)) {
      const txt = (el.textContent ?? "").trim().toUpperCase();
      const rect = el.getBoundingClientRect();

      // Skip hidden or very small elements
      if (rect.width < 20 || rect.height < 10) continue;
      // Skip inputs, forms, scripts
      if (el.tagName === "INPUT" || el.tagName === "FORM" || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
      // Skip elements with too many children (we want leaf-level items)
      if (el.childElementCount > 3) continue;

      const iataAttr = (el as HTMLElement).dataset?.iata?.toUpperCase();
      if (
        iataAttr === codeUpper ||
        txt === codeUpper ||
        txt.startsWith(codeUpper + " ") ||
        txt.startsWith(codeUpper + " -") ||
        txt.includes(`(${codeUpper})`) ||
        txt.startsWith(codeUpper + "—")
      ) {
        (el as HTMLElement).click();
        return { clicked: true, text: txt, tag: el.tagName };
      }
    }

    return { clicked: false };
  }, iataCode);

  if (!result.clicked) {
    throw new Error(`No dropdown item matching "${iataCode}" found for ${label}`);
  }

  logger.info({ label, iataCode, matchedText: (result as any).text }, "Dropdown item clicked");
}

/** Switch to one-way via React native setter, then select calendar day. */
async function setOnewayAndDate(
  page: import("playwright").Page,
  year: number,
  month: number,
  day: number,
): Promise<void> {
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

  const onewayBtn = page.locator("button, label, span").filter({ hasText: /^Một chiều$/ }).first();
  if (await onewayBtn.count() > 0) {
    await onewayBtn.click({ force: true }).catch(() => { /* ignore */ });
    await page.waitForTimeout(400);
  }

  await selectCalendarDay(page, year, month, day);
}

/** Navigate the calendar to target month and tap the day. */
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

  await page.waitForTimeout(500);

  for (let attempt = 0; attempt < 13; attempt++) {
    const result = await page.evaluate(
      ({ yr, mo, dy, monthStr }) => {
        const monthSelectors = [".rdrMonth", ".calendar-month", "[class*='Month']"];
        let monthContainers: Element[] = [];
        for (const sel of monthSelectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) {
            monthContainers = Array.from(els);
            break;
          }
        }

        if (monthContainers.length === 0) {
          const allHeaders = document.querySelectorAll("h3, h4, h5, span, div");
          for (const header of Array.from(allHeaders)) {
            const txt = (header.textContent ?? "").trim();
            if (txt.includes(String(yr)) && (txt.includes(monthStr) || txt.includes(`/${String(mo).padStart(2, "0")}/`))) {
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
            const dayBtns = mc.querySelectorAll("button");
            for (const btn of Array.from(dayBtns)) {
              const btnTxt = (btn.textContent ?? "").trim();
              const isDisabled = btn.classList.contains("rdrDayDisabled") ||
                btn.classList.contains("rdrDayPassive") ||
                btn.hasAttribute("disabled");
              if (btnTxt === String(dy) && !isDisabled) {
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

/** Close the passenger selection modal. */
async function dismissPassengerModal(page: import("playwright").Page): Promise<void> {
  try {
    const dismissed = await page.evaluate(() => {
      for (const label of ["close", "Close", "đóng", "Đóng", "close modal"]) {
        const btn = document.querySelector(`button[aria-label='${label}']`) as HTMLElement | null;
        if (btn) { btn.click(); return true; }
      }

      const allBtns = document.querySelectorAll("button");
      for (const btn of Array.from(allBtns)) {
        const rect = btn.getBoundingClientRect();
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

      const closeSelectors = [".modal-close", "[data-dismiss='modal']", ".close-btn", "button.close", ".modal-header button:last-child"];
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

  for (const label of ["close", "Close", "đóng"]) {
    try {
      const btn = page.locator(`button[aria-label='${label}']`).first();
      if (await btn.count() > 0) {
        await btn.click({ force: true });
        await page.waitForTimeout(400);
        return;
      }
    } catch { /* not visible */ }
  }
}

async function waitForCookie(
  context: import("playwright").BrowserContext,
  name: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cookies = await context.cookies();
    if (cookies.some((c) => c.name === name)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
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
