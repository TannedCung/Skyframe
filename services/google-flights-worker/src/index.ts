import http from "http";
import { searchGoogleFlights, type SearchParams, type SearchResult } from "./search";
import { logger } from "./logger";

const PORT = parseInt(process.env["PORT"] ?? "3002", 10);
const SECRET = process.env["GOOGLE_FLIGHTS_SERVICE_SECRET"] ?? "";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour per query

interface CacheEntry {
  result: SearchResult;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function cacheKey(p: SearchParams): string {
  return [
    p.origin,
    p.destination,
    p.dateFrom,
    p.dateTo,
    p.roundTrip ? "rt" : "ow",
    p.maxStops ?? "x",
    p.preferenceCheapest ? "ch" : "be",
    p.preferenceFlightTime ?? "any",
    (p.airlines ?? []).slice().sort().join(","),
  ].join("|");
}

async function getFlights(p: SearchParams): Promise<SearchResult> {
  const key = cacheKey(p);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info({ key }, "Returning cached results");
    return cached.result;
  }

  const result = await searchGoogleFlights(p);
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function validateParams(b: unknown): SearchParams | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const required = ["origin", "destination", "dateFrom", "dateTo", "roundTrip"];
  for (const k of required) {
    if (!(k in o)) return null;
  }
  if (typeof o["origin"] !== "string" || typeof o["destination"] !== "string") return null;
  if (typeof o["dateFrom"] !== "string" || typeof o["dateTo"] !== "string") return null;
  if (typeof o["roundTrip"] !== "boolean") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o["dateFrom"])) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o["dateTo"])) return null;

  return {
    origin: o["origin"].toUpperCase(),
    destination: o["destination"].toUpperCase(),
    dateFrom: o["dateFrom"],
    dateTo: o["dateTo"],
    roundTrip: o["roundTrip"],
    maxStops: typeof o["maxStops"] === "number" ? o["maxStops"] : undefined,
    preferenceCheapest:
      typeof o["preferenceCheapest"] === "boolean" ? o["preferenceCheapest"] : true,
    preferenceFlightTime:
      o["preferenceFlightTime"] === "day" ||
      o["preferenceFlightTime"] === "night" ||
      o["preferenceFlightTime"] === "any"
        ? o["preferenceFlightTime"]
        : "any",
    airlines:
      Array.isArray(o["airlines"]) && o["airlines"].every((a) => typeof a === "string")
        ? (o["airlines"] as string[])
        : undefined,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Health — no auth required
  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, { ok: true, cacheSize: cache.size, uptimeSec: Math.floor(process.uptime()) });
    return;
  }

  // Bearer auth on everything else
  const auth = req.headers["authorization"] ?? "";
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    send(res, 401, { error: "Unauthorized" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/search") {
    try {
      const raw = await readBody(req);
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        send(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const params = validateParams(json);
      if (!params) {
        send(res, 400, {
          error:
            "Invalid params. Required: origin (string), destination (string), dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD), roundTrip (boolean). Optional: maxStops, preferenceCheapest, preferenceFlightTime, airlines[]",
        });
        return;
      }
      const result = await getFlights(params);
      send(res, 200, result);
    } catch (err) {
      logger.error({ err: String(err) }, "Search failed");
      send(res, 503, { error: "Flight search failed" });
    }
    return;
  }

  send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  logger.info({ port: PORT }, "Google Flights worker started");
  if (!SECRET) {
    logger.warn("GOOGLE_FLIGHTS_SERVICE_SECRET is not set — all requests will be rejected");
  }
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
