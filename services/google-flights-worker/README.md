# Google Flights worker

Tiny Node service that scrapes Google Flights using Chrome TLS fingerprint
impersonation (`impers` + `libcurl-impersonate` via `koffi` FFI). Lives outside
the Vercel app because native FFI doesn't run cleanly on Lambda.

The Skyframe app talks to it as an HTTP client via
`src/lib/flights/google.ts` (`GoogleFlightsProvider`).

## API

All non-`/health` routes require `Authorization: Bearer ${GOOGLE_FLIGHTS_SERVICE_SECRET}`.

### `GET /health`

```json
{ "ok": true, "cacheSize": 0, "uptimeSec": 12 }
```

### `POST /search`

Request body:

```json
{
  "origin": "HAN",
  "destination": "NRT",
  "dateFrom": "2026-08-15",
  "dateTo": "2026-08-22",
  "roundTrip": true,
  "maxStops": 0,
  "preferenceCheapest": true,
  "preferenceFlightTime": "any"
}
```

Response:

```json
{
  "flights": [{ "provider": "google", "price": 8200000, "currency": "VND", "outbound": {...}, ... }],
  "capturedAt": "2026-05-14T10:00:00.000Z"
}
```

Results are cached in-memory per identical query for 1 hour.

## Local dev

```bash
cd services/google-flights-worker
npm install
GOOGLE_FLIGHTS_SERVICE_SECRET=local-dev npm run dev
# In another shell:
curl -s -X POST http://localhost:3002/search \
  -H 'Authorization: Bearer local-dev' \
  -H 'Content-Type: application/json' \
  -d '{"origin":"HAN","destination":"SGN","dateFrom":"2026-08-15","dateTo":"2026-08-22","roundTrip":true,"preferenceCheapest":true}' | jq
```

On macOS / Linux the `impers` package ships a prebuilt `koffi` native module + the
right `libcurl-impersonate-chrome` shared lib. If `libcurl-impersonate` is missing
on your distro, `koffi.load()` will throw — install it from the
[curl-impersonate releases](https://github.com/lwthiker/curl-impersonate/releases).

## Deploy to Railway

Railway autodetects the `Dockerfile` in this directory.

**One-time setup (you do this):**

1. Create a Railway account at <https://railway.app>.
2. Install the CLI:

   ```bash
   npm i -g @railway/cli
   ```

3. From this directory, log in and create a project:

   ```bash
   cd services/google-flights-worker
   railway login          # opens a browser
   railway init           # name the project, pick "empty project"
   railway link           # ensures the local dir is linked to the project
   ```

4. Set the service secret (generate a strong random string):

   ```bash
   railway variables set GOOGLE_FLIGHTS_SERVICE_SECRET=$(openssl rand -hex 32)
   ```

   Also confirm `PORT=3002` is set (the Dockerfile already exports it; Railway
   provides `PORT` automatically, but our server falls back to 3002).

5. Deploy:

   ```bash
   railway up             # builds the Dockerfile and deploys
   ```

6. Get the public URL:

   ```bash
   railway domain         # generates *.up.railway.app or prints the existing one
   ```

   Copy the URL — e.g. `https://google-flights-worker-production.up.railway.app`.

7. Smoke-test:

   ```bash
   curl https://YOUR-RAILWAY-URL/health
   # → { "ok": true, ... }
   ```

**Wire it into Vercel:**

In the Vercel project dashboard (or CLI), set:

```
GOOGLE_FLIGHTS_SERVICE_URL=https://YOUR-RAILWAY-URL
GOOGLE_FLIGHTS_SERVICE_SECRET=<same-value-as-railway>
```

```bash
# CLI form (run from the repo root):
vercel env add GOOGLE_FLIGHTS_SERVICE_URL production
vercel env add GOOGLE_FLIGHTS_SERVICE_SECRET production
vercel --prod   # redeploy with the new env
```

## Verifying end-to-end

After both the worker is up and the Vercel app has the env vars, trigger a flight
search through the chat UI. The Vercel logs should show
`Google Flights worker search succeeded` and the Railway logs should show
`Google Flights search succeeded` with a non-zero `count`.

## Operating notes

- **Cold starts**: Railway keeps the container warm by default (no scale-to-zero on
  Hobby plan unless explicitly configured). Cold starts cost ~1-2s.
- **Memory**: ~120 MB resident; fits comfortably in Railway's 512 MB Hobby tier.
- **Cache**: in-memory, 1 hour TTL per identical query. Cache lost on restart.
  Move to Redis if you need stickiness across deploys.
- **Rate-limits**: Google returns 429 on rapid repeat requests from the same IP.
  The worker retries with backoff up to 3 times. If you see persistent 429s,
  consider rotating Railway regions or adding a residential proxy.
- **`impers` ABI breakage**: this depends on `koffi` ABI-compatible with the host
  glibc. Pin the Node base image; don't upgrade across major Debian releases
  without re-testing.
