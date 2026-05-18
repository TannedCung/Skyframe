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
    let hasSearchFlightResponse = false;
    context.on("response", async (res) => {
      const url = res.url();
      // CMS responses are noise — only the booking API matters for flight data.
      if (!url.includes("vietjet-api.vietjetair.com") || res.status() !== 200) return;
      try {
        const body = await res.json();
        capturedFlightJson.push(body);
        const isSearchFlight = url.includes("/search-flight");
        if (isSearchFlight) hasSearchFlightResponse = true;
        logger.info({ url: url.split("?")[0], isSearchFlight }, "Captured VietJet booking response");
      } catch { /* ignore non-JSON */ }
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

    // ── 4. Set one-way + select date on the auto-opened calendar ────────────
    // Direct nav to /vi/book-flight loses React state and redirects to home —
    // the calendar auto-opens after airport selection, so drive it instead.
    logger.info({ departDate }, "Selecting date on calendar");
    stepStart = Date.now();
    await setOnewayAndDate(page, year, month, day);
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
    const searchBtnCount = await searchBtn.count();
    if (searchBtnCount === 0) {
      logger.warn("No 'Tìm chuyến' button found — search will not fire");
    } else {
      try {
        await searchBtn.click({ force: true, timeout: 5_000 });
      } catch (err) {
        logger.warn({ err: String(err) }, "Search button click failed, retrying via dispatchEvent");
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const target = btns.reverse().find((b) => /Tìm chuyến/i.test(b.textContent ?? ""));
          if (target) target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        });
      }
    }
    logger.info({ elapsed: Date.now() - stepStart, searchBtnCount }, "Search submitted");

    // ── 7. Wait for /search-flight response specifically ─────────────────────
    // CMS responses arrive constantly — only the booking API has flight data.
    logger.info("Waiting for /search-flight response");
    const deadline = Date.now() + API_CAPTURE_TIMEOUT_MS;
    while (!hasSearchFlightResponse && Date.now() < deadline) {
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

/** Click a dropdown item matching the IATA code via Playwright tap. */
async function clickDropdownItem(
  page: import("playwright").Page,
  iataCode: string,
  label: string,
): Promise<void> {
  // DOM .click() doesn't trigger React in iPhone touch context — must use
  // Playwright .click()/.tap() so touch events fire. Walk divs from last to
  // first because the leaf-level div containing just the IATA code is usually
  // the actual clickable row.
  const codeRe = new RegExp(`^\\s*${iataCode}\\s*$`);
  const divItems = page.locator("div").filter({ hasText: codeRe });
  const count = await divItems.count();
  for (let i = count - 1; i >= 0; i--) {
    const item = divItems.nth(i);
    const txt = ((await item.textContent().catch(() => "")) ?? "").trim();
    if (txt !== iataCode) continue;
    try {
      await item.click({ force: true, timeout: 5_000 });
      logger.info({ label, iataCode }, "Dropdown item clicked");
      return;
    } catch { /* try next candidate */ }
  }
  throw new Error(`No dropdown item with exact text "${iataCode}" for ${label}`);
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

/** Navigate the calendar to target month and tap the day.
 *
 * iPhone 12 Pro context fires touch events; react-date-range listens to
 * touchend, not synthetic .click(). Use Playwright .tap() for the day so the
 * React state actually updates and the search button becomes enabled.
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

  await page.waitForTimeout(500);

  // ── Navigate calendar to the target month ────────────────────────────────
  // Calendar uses an <img src="…angle-right.svg"> for the next-month control —
  // standard "next button" selectors miss it. Tap the image's clickable
  // ancestor with Playwright so touch events fire in iPhone context.
  // Restrict to elements inside the calendar so we don't tap decorative
  // angle-right images elsewhere on the page (which times out).
  const calendarRoot = page.locator(".rdrCalendarWrapper, [class*='Calendar'], [class*='DateRange']").first();
  const nextLocators = [
    calendarRoot.locator(".rdrNextButton").first(),
    calendarRoot.locator("img[src*='angle-right']").locator("xpath=ancestor::*[self::button or self::a or @role='button'][1]").first(),
    calendarRoot.locator("img[src*='angle-right']").first(),
    page.locator(".rdrNextButton, button[aria-label*='Next' i], button[aria-label*='Tiếp' i]").first(),
  ];

  for (let attempt = 0; attempt < 15; attempt++) {
    const onTarget = await page.evaluate(
      ({ yr, monthStr, mo }) => {
        const mcs = document.querySelectorAll(".rdrMonth, [class*='Month']");
        for (const mc of Array.from(mcs)) {
          const txt = (mc.textContent ?? "").trim();
          if (
            txt.includes(String(yr)) &&
            (txt.includes(monthStr) || txt.includes(`/${String(mo).padStart(2, "0")}/`))
          ) return true;
        }
        return false;
      },
      { yr: year, monthStr: targetMonthStr, mo: month },
    );

    if (onTarget) {
      logger.info({ attempt }, "Calendar on target month");
      break;
    }

    let tapped = false;
    for (const loc of nextLocators) {
      try {
        if ((await loc.count()) === 0) continue;
        await loc.tap({ timeout: 3_000 });
        tapped = true;
        break;
      } catch { /* try next locator */ }
    }

    if (!tapped) {
      // Last resort: DOM click on any small element with the angle-right SVG/img.
      const fallbackClicked = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll("button, a, [role='button'], div"));
        for (const el of candidates) {
          const img = el.querySelector("img[src*='angle-right']");
          if (img) { (el as HTMLElement).click(); return true; }
        }
        return false;
      });
      if (!fallbackClicked) {
        logger.warn({ attempt }, "No calendar next button found, stopping navigation");
        break;
      }
    }
    await page.waitForTimeout(500);
  }

  // ── Tap the day span (real touch event for iPhone context) ───────────────
  const daySelectors = [
    `.rdrMonth:has-text("${targetMonthStr}") button.rdrDay:not(.rdrDayDisabled):not(.rdrDayPassive):has(.rdrDayNumber span:text-is("${day}"))`,
    `button.rdrDay:not(.rdrDayDisabled):not(.rdrDayPassive):has(.rdrDayNumber span:text-is("${day}"))`,
  ];

  for (const sel of daySelectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) {
        await loc.tap({ timeout: 4_000 });
        await page.waitForTimeout(700);
        logger.info({ year, month, day, sel }, "Calendar day tapped");
        return;
      }
    } catch (err) {
      logger.warn({ sel, err: String(err) }, "Tap selector failed");
    }
  }

  // Last resort: direct DOM click (may not register on touch context, but try)
  try {
    const fallback = await page.evaluate((dy) => {
      const dayBtns = document.querySelectorAll("button.rdrDay:not(.rdrDayDisabled):not(.rdrDayPassive)");
      for (const btn of Array.from(dayBtns)) {
        const span = btn.querySelector(".rdrDayNumber span");
        if (span && (span.textContent ?? "").trim() === String(dy)) {
          (span as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, day);
    if (fallback) {
      await page.waitForTimeout(700);
      logger.info({ day }, "Calendar day clicked via fallback DOM click");
      return;
    }
  } catch { /* page crashed */ }

  logger.error({ year, month, day }, "Failed to select any calendar day");
}

/** Close the passenger selection modal — try Playwright click first (DOM click
 * via page.evaluate doesn't fire touch events in iPhone context). */
async function dismissPassengerModal(page: import("playwright").Page): Promise<void> {
  // Strategy 1: aria-label close (the one that works in local debug runs).
  for (const sel of [
    "button[aria-label='close']",
    "button[aria-label='Close']",
    "button[aria-label='đóng']",
    "button[aria-label='Đóng']",
  ]) {
    try {
      const btn = page.locator(sel).first();
      if ((await btn.count()) > 0) {
        await btn.click({ force: true, timeout: 3_000 });
        await page.waitForTimeout(500);
        logger.info({ sel }, "Passenger modal closed via aria-label");
        return;
      }
    } catch { /* try next */ }
  }

  // Strategy 2: any button with an SVG/icon in upper-right of modal header.
  try {
    const svgClose = page.locator("button:has(svg)").filter({
      has: page.locator("[class*='close' i]"),
    }).first();
    if ((await svgClose.count()) > 0) {
      await svgClose.click({ force: true, timeout: 3_000 });
      await page.waitForTimeout(500);
      logger.info("Passenger modal closed via SVG button");
      return;
    }
  } catch { /* try next */ }

  // Strategy 3: DOM dispatchEvent fallback (older overlay-intercept workaround).
  try {
    const dispatched = await page.evaluate(() => {
      const selectors = [
        'button[aria-label="close"]',
        'button[aria-label="Close"]',
        '.MuiDialogTitle-root button',
        '[class*="closeButton"]',
        '[class*="close-button"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) {
          el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          return true;
        }
      }
      const btns = document.querySelectorAll("button");
      for (const btn of Array.from(btns)) {
        const rect = btn.getBoundingClientRect();
        if (rect.top < 200 && rect.left > window.innerWidth * 0.6 && btn.querySelector("svg")) {
          btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          return true;
        }
      }
      return false;
    });
    if (dispatched) {
      await page.waitForTimeout(500);
      logger.info("Passenger modal closed via dispatchEvent fallback");
    }
  } catch { /* page crashed */ }
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
