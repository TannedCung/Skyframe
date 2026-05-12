import http from "http";
import { searchFlights, type SearchResult } from "./browser";
import { logger } from "./logger";

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);
const SECRET = process.env["TOKEN_SERVICE_SECRET"] ?? "";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour per route

// Simple in-memory cache keyed by "ORIGIN:DEST:DATE"
interface CacheEntry {
  result: SearchResult;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function cacheKey(origin: string, dest: string, date: string) {
  return `${origin}:${dest}:${date}`;
}

async function getFlights(
  origin: string,
  dest: string,
  date: string,
): Promise<SearchResult> {
  const key = cacheKey(origin, dest, date);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info({ key }, "Returning cached flight results");
    return cached.result;
  }

  const result = await searchFlights(origin, dest, date);
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

function unauthorized(res: http.ServerResponse) {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
}

function badRequest(res: http.ServerResponse, msg: string) {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: msg }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Health — no auth required
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, cacheSize: cache.size }));
    return;
  }

  // Validate bearer secret on all other routes
  const auth = req.headers["authorization"] ?? "";
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    unauthorized(res);
    return;
  }

  // GET /search?origin=HAN&destination=SGN&date=2026-07-01
  if (req.method === "GET" && url.pathname === "/search") {
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

    try {
      const result = await getFlights(origin, destination, date);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      logger.error({ err, origin, destination, date }, "Flight search failed");
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Flight search failed" }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  logger.info({ port: PORT }, "VietJet search service started");
  if (!SECRET) {
    logger.warn("TOKEN_SERVICE_SECRET is not set — all requests will be rejected");
  }
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
