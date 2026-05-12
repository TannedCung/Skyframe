import { buildGoogleFilters, encodeGoogleFilters } from "../google-encoding";

describe("buildGoogleFilters", () => {
  it("builds one-way filter with correct structure", () => {
    const filters = buildGoogleFilters({
      origin: "HAN",
      destination: "NRT",
      dateFrom: "2026-06-15",
      dateTo: "2026-06-15",
      roundTrip: false,
      preferenceCheapest: true,
    });

    expect(filters[0]).toEqual([]);

    const settings = filters[1] as unknown[];
    expect(settings[2]).toBe(2);
    expect(settings[5]).toBe(1);
    expect(settings[6]).toEqual([1, 0, 0, 0]);

    const segments = settings[13] as unknown[][];
    expect(segments.length).toBe(1);
    expect(segments[0][0]).toEqual([[["HAN", 0]]]);
    expect(segments[0][1]).toEqual([[["NRT", 0]]]);
    expect(segments[0][6]).toBe("2026-06-15");
    expect(filters[2]).toBe(2);
  });

  it("builds round-trip filter with return segment", () => {
    const filters = buildGoogleFilters({
      origin: "HAN",
      destination: "NRT",
      dateFrom: "2026-06-15",
      dateTo: "2026-06-25",
      roundTrip: true,
      preferenceCheapest: false,
    });

    const settings = filters[1] as unknown[];
    expect(settings[2]).toBe(1);

    const segments = settings[13] as unknown[][];
    expect(segments.length).toBe(2);
    expect(segments[0][6]).toBe("2026-06-15");
    expect(segments[1][6]).toBe("2026-06-25");
  });

  it("applies day flight preference as time window", () => {
    const filters = buildGoogleFilters({
      origin: "HAN",
      destination: "NRT",
      dateFrom: "2026-06-15",
      dateTo: "2026-06-15",
      roundTrip: false,
      preferenceCheapest: true,
      departAfter: 6,
      departBefore: 20,
    });

    const settings = filters[1] as unknown[];
    const segments = settings[13] as unknown[][];
    expect(segments[0][2]).toEqual([6, 20]);
  });
});

describe("encodeGoogleFilters", () => {
  it("produces URL-encoded triple-wrapped JSON", () => {
    const filters = buildGoogleFilters({
      origin: "HAN",
      destination: "NRT",
      dateFrom: "2026-06-15",
      dateTo: "2026-06-15",
      roundTrip: false,
      preferenceCheapest: true,
    });

    const encoded = encodeGoogleFilters(filters);
    expect(encoded).not.toContain(" ");
    expect(encoded).toContain("%");

    const decoded = decodeURIComponent(encoded);
    const parsed = JSON.parse(decoded);
    expect(parsed[0]).toBeNull();
    expect(typeof parsed[1]).toBe("string");

    const inner = JSON.parse(parsed[1]);
    expect(inner[0]).toEqual([]);
    expect(inner[1][2]).toBe(2);
  });
});
