# Skyframe – Feature Plan: Google Flights Provider via `impers`

## Context

Google Flights uses an internal RPC endpoint that can be reverse-engineered. The challenge is TLS fingerprinting — standard `fetch`/`node:http` gets 403'd because the TLS ClientHello doesn't match Chrome.

We'll use **`impers`** (lexiforest/impers) — the Node.js equivalent of Python's `curl_cffi` — to impersonate Chrome 146's TLS fingerprint. It's a single `npm install` with zero additional infrastructure.

Two projects have already mapped the protocol:
- [fli](https://github.com/punitarani/fli) (Python) — `curl_cffi` + Pydantic models
- [trvl](https://github.com/MikkoParkkola/trvl) (Go) — `utls` + `batchexec`

---

## Technical Findings

### Endpoint
```
POST https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults?hl=en
```

### Request Format
- **Content-Type**: `application/x-www-form-urlencoded;charset=UTF-8`
- **Body**: `f.req=<encoded>` where the value is:
  1. Build nested filter array (origin, destination, dates, cabin, passengers, etc.)
  2. `JSON.stringify(array, separators=(',', ':'))` (minified)
  3. Wrap: `[null, json_string]`
  4. `JSON.stringify(wrapped, separators=(',', ':'))`
  5. `encodeURIComponent(result)`
- **No API key required**

### Response Format
- Strip `)]}'` prefix
- `JSON.parse()` → `[0][2]` = the parsed response string → `JSON.parse()` again
- Flight data lives in `data[2]` and `data[3]` (arrays of itineraries)
- Key positional fields (from trvl `batchexec/decode.go` + fli `search/flights.py`):
  - `itinerary[1][0][-1]` → price in whole currency units (not cents)
  - `itinerary[0][9]` → total duration in minutes
  - `itinerary[0][2]` → segments array
  - `segment[2][0]` → airline code, `segment[2][1]` → flight number
  - `segment[3]` → departure airport, `segment[6]` → arrival airport
  - `segment[8]` → departure `[year, month, day]`
  - `segment[10]` → arrival `[year, month, day]`
  - `segment[20]` → departure `[hour, minute]`
  - `segment[21]` → arrival `[hour, minute]`

### Payload Structure (from trvl `search.go:buildFilters`)
```ts
const filters = [
  [],  // outer[0]: empty = flights mode
  [    // outer[1]: settings
    null,              // [0]
    null,              // [1]
    tripType,          // [2] 1=round-trip, 2=one-way
    null,              // [3]
    [],                // [4]
    cabinClass,        // [5] 1=economy, 2=premium, 3=business, 4=first
    [adults, 0, 0, 0], // [6] passengers
    priceLimit,        // [7] max price or null
    null,              // [8-9]
    null,              // [10] bags [carryOn, checked] or null
    null,              // [11-12]
    segments,          // [13] array of segment filters
    null,              // [14-17]
    null,              // [18-27]
    excludeBasic ? 1 : 0, // [28]
  ],
  sortBy,  // outer[2] 1=best, 2=cheapest, 3=duration
  1,       // outer[3] show all results
  0,       // outer[4]
  1,       // outer[5]
];
```

Each segment:
```ts
[
  [[[origin, 0]]],     // [0] departure airports
  [[[dest, 0]]],       // [1] arrival airports
  [startHour, endHour],// [2] departure time window or null
  stops,               // [3] 0=any, 1=nonstop, 2=1stop, 3=2+
  airlines,            // [4] or null
  alliances,           // [5] or null
  date,                // [6] "YYYY-MM-DD"
  durationLimit,       // [7] or null
  null,                // [8] selected flight
  null,                // [9] layover airports
  null,                // [10-12]
  emissions,           // [13] [1] or null
  3,                   // [14]
]
```

---

## Implementation Plan (inline, no separate service)

### Phase 1 — Install `impers`

```bash
npm install impers
```

Auto-fetches `libcurl-impersonate` on first run. Requires Node.js 18+.

### Phase 2 — `src/lib/flights/google-encoding.ts`

Two functions ported from trvl's `search.go` + `batchexec/encode.go` + fli's `flights.py`:

1. **`buildFlightFilters(params: FlightSearchParams) → any[]`** — builds the nested filter array matching Google's expected structure
2. **`encodeFilters(filters: any[]) → string`** — JSON stringify + wrap + URL encode
3. **`parseGoogleFlightsResponse(raw: string): ParsedFlight[]`** — strips prefix, double JSON parse, extracts from positional indices

### Phase 3 — `src/lib/flights/google.ts`

```ts
import { post } from "impers";
import type { FlightProvider, FlightSearchParams, FlightOption } from "./types";

export class GoogleFlightsProvider implements FlightProvider {
  async searchFlights(params: FlightSearchParams): Promise<FlightOption[]> {
    // 1. Build + encode filters
    const filters = buildFlightFilters(params);
    const encoded = encodeFilters(filters);

    // 2. POST with Chrome 146 TLS impersonation
    const res = await post(FlightsURL, {
      impersonate: "chrome146",
      data: `f.req=${encoded}`,
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "referer": "https://www.google.com/travel/flights",
      },
      timeout: 20_000,
    });

    if (res.status === 403) throw new Error("Google Flights blocked (403)");
    if (res.status !== 200) throw new Error(`Google Flights error: ${res.status}`);

    // 3. Parse → map to FlightOption[]
    const parsed = parseGoogleFlightsResponse(res.text);
    return parsed.map(mapToFlightOption);
  }
}
```

### Phase 4 — Integration

1. **`src/lib/flights/types.ts`** — add `"google"` to `FlightOption.provider` union
2. **`src/lib/flights/factory.ts`** — add `GoogleFlightsProvider` to chain after Kiwi, before AirLabs. Guarded by `GOOGLE_FLIGHTS_ENABLED=true` env var
3. **`src/types/index.ts`** — add `'google'` to `GdsProvider` type
4. **`src/app/settings/page.tsx`** — add "Google Flights" option to radio group
5. **`src/app/api/mcp/route.ts`** — add `google` to `list_providers`
6. **`.env.local.example`** — add `GOOGLE_FLIGHTS_ENABLED=true`

### Phase 5 — Tests

1. **`src/lib/flights/__tests__/google-encoding.test.ts`** — unit tests: encode/decode roundtrips, known payloads match expected output
2. **`tests/integration/google-flights.test.ts`** — live test against Google Flights (skip in CI, run manually). Verify:
   - Flights returned for HAN→NRT on a future date
   - Departure/arrival times are correct (local airport time, not UTC)
   - Prices are populated and non-zero
   - Flight numbers and airlines are parsed

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Google changes API | Fall back to Kiwi in composite chain on parse errors; version the encoder |
| TLS blocked (403) | Retry with 1s backoff; rate limit to 1 req/s; cache 5 min |
| Price in unexpected currency | Return whatever Google provides (IP-based); let caller display currency from response |
| Date/Time parsing edge cases | Validate against `validateIata()` + `Date` constructor; reject invalid |

---

## File Changes Summary

| File | Action |
|---|---|
| `src/lib/flights/google-encoding.ts` | **create** |
| `src/lib/flights/google.ts` | **create** |
| `src/lib/flights/__tests__/google-encoding.test.ts` | **create** |
| `tests/integration/google-flights.test.ts` | **create** |
| `src/lib/flights/factory.ts` | modify (+5 lines) |
| `src/lib/flights/types.ts` | modify (+1 union member) |
| `src/types/index.ts` | modify (+1 union member) |
| `src/app/settings/page.tsx` | modify (+1 radio option) |
| `src/app/api/mcp/route.ts` | modify (+1 line) |
| `.env.local.example` | modify (+1 env var) |

---

## Effort Estimate

- **`impers` install + smoke test**: 15 min
- **Encoding/parsing** (ported from trvl/fli): 1.5 hours
- **Provider class**: 30 min
- **Integration** (factory, types, settings, MCP): 30 min
- **Tests** (unit + integration): 1 hour
- **Total**: ~3-4 hours
