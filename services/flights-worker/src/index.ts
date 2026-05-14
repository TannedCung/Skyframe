import http from "http";
import { searchGoogleFlights, type GoogleSearchParams, type GoogleSearchResult } from "./google/search.js";
import { searchVietJetFlights, type VietJetSearchResult } from "./vietjet/browser.js";
import { logger } from "./logger.js";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const SECRET = process.env["FLIGHTS_SERVICE_SECRET"] ?? "";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Shared cache ─────────────────────────────────────────────────────────────

interface CacheEntry {
  result: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.result as T;
  if (entry) cache.delete(key);
  return null;
}

function setCache(key: string, result: unknown): void {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Auth middleware ───────────────────────────────────────────────────────────

function isAuthorized(req: http.IncomingMessage): boolean {
  if (!SECRET) return false;
  const auth = req.headers["authorization"] ?? "";
  return auth === `Bearer ${SECRET}`;
}

function unauthorized(res: http.ServerResponse): void {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
}

function badRequest(res: http.ServerResponse, msg: string): void {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: msg }));
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  json(res, 200, {
    ok: true,
    cacheSize: cache.size,
    uptimeSec: Math.floor(process.uptime()),
    providers: ["google", "vietjet"],
  });
}

async function handleGoogleSearch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readBody(req);
  let params: GoogleSearchParams;
  try {
    params = JSON.parse(body) as GoogleSearchParams;
  } catch {
    badRequest(res, "Invalid JSON body");
    return;
  }

  if (!params.origin || !params.destination || !params.dateFrom) {
    badRequest(res, "origin, destination, and dateFrom are required");
    return;
  }

  const key = `google:${params.origin}|${params.destination}|${params.dateFrom}|${params.dateTo ?? ""}|${params.roundTrip ? "rt" : "ow"}|${params.maxStops ?? 0}|${params.preferenceCheapest ? "ch" : "be"}|${params.preferenceFlightTime ?? "any"}|${(params.airlines ?? []).join(",")}`;

  const cached = getCached<GoogleSearchResult>(key);
  if (cached) {
    logger.info({ key }, "Returning cached Google Flights results");
    json(res, 200, cached);
    return;
  }

  try {
    const result = await searchGoogleFlights(params);
    setCache(key, result);
    json(res, 200, result);
  } catch (err) {
    logger.error({ err, key }, "Google Flights search failed");
    json(res, 503, { error: "Google Flights search failed", detail: String(err) });
  }
}

async function handleVietJetSearch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const origin = url.searchParams.get("origin")?.toUpperCase();
  const destination = url.searchParams.get("destination")?.toUpperCase();
  const date = url.searchParams.get("date"); // YYYY-MM-DD

  if (!origin || !destination || !date) {
    badRequest(res, "origin, destination, and date are required");
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    badRequest(res, "date must be YYYY-MM-DD");
    return;
  }

  const key = `vietjet:${origin}:${destination}:${date}`;

  const cached = getCached<VietJetSearchResult>(key);
  if (cached) {
    logger.info({ key }, "Returning cached VietJet results");
    json(res, 200, cached);
    return;
  }

  try {
    const result = await searchVietJetFlights(origin, destination, date);
    setCache(key, result);
    json(res, 200, result);
  } catch (err) {
    logger.error({ err, key }, "VietJet search failed");
    json(res, 503, { error: "VietJet search failed", detail: String(err) });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  try {
    // Health — no auth
    if (req.method === "GET" && url.pathname === "/health") {
      await handleHealth(req, res);
      return;
    }

    // All other routes require auth
    if (!isAuthorized(req)) {
      unauthorized(res);
      return;
    }

    // Google Flights: POST /search/google
    if (req.method === "POST" && url.pathname === "/search/google") {
      await handleGoogleSearch(req, res);
      return;
    }

    // VietJet: GET /search/vietjet?origin=HAN&destination=SGN&date=2026-07-01
    if (req.method === "GET" && url.pathname === "/search/vietjet") {
      await handleVietJetSearch(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (err) {
    logger.error({ err, url: req.url }, "Unhandled request error");
    json(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  logger.info({ port: PORT, providers: ["google", "vietjet"] }, "Flights worker started");
  if (!SECRET) {
    logger.warn("FLIGHTS_SERVICE_SECRET is not set — all requests will be rejected");
  }
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
