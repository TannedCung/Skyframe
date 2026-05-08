import { isValidIata, validateIata } from "@/lib/iata";

describe("isValidIata", () => {
  it("returns true for known codes", () => {
    expect(isValidIata("HAN")).toBe(true);
    expect(isValidIata("NRT")).toBe(true);
    expect(isValidIata("LHR")).toBe(true);
    expect(isValidIata("JFK")).toBe(true);
  });

  it("returns false for unknown codes", () => {
    expect(isValidIata("XYZ")).toBe(false);
    expect(isValidIata("AAA")).toBe(false);
  });

  it("returns false for wrong format", () => {
    expect(isValidIata("han")).toBe(false); // lowercase
    expect(isValidIata("HANX")).toBe(false); // 4 chars
    expect(isValidIata("HA")).toBe(false); // 2 chars
    expect(isValidIata("")).toBe(false);
  });
});

describe("validateIata", () => {
  it("does not throw for valid code", () => {
    expect(() => validateIata("HAN")).not.toThrow();
  });

  it("throws with field name for invalid code", () => {
    expect(() => validateIata("XYZ", "originAirport")).toThrow(
      "originAirport 'XYZ' is not a recognised IATA code",
    );
  });
});
