/**
 * @jest-environment node
 */
import { buildSG1UserPrompt } from "@/lib/llm/prompts/sg1";
import type { Trip } from "@/types";

const mockTrip: Trip = {
  id: "trip-1",
  userId: "user-1",
  title: "Japan Spring 2025",
  originAirport: "HAN",
  destinationCity: null,
  destinationCountry: "Japan",
  startDate: new Date("2025-03-01"),
  endDate: new Date("2025-03-15"),
  flexibilityDays: 3,
  preferenceCheapest: true,
  preferenceFlightTime: "day",
  tripType: "round_trip",
  status: "draft",
  lastFlightRefreshAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("buildSG1UserPrompt", () => {
  it("includes origin airport", () => {
    const prompt = buildSG1UserPrompt(mockTrip);
    expect(prompt).toContain("HAN");
  });

  it("includes destination country", () => {
    const prompt = buildSG1UserPrompt(mockTrip);
    expect(prompt).toContain("Japan");
  });

  it("includes flexibility days", () => {
    const prompt = buildSG1UserPrompt(mockTrip);
    expect(prompt).toContain("±3 days");
  });

  it("includes trip type", () => {
    const prompt = buildSG1UserPrompt(mockTrip);
    expect(prompt).toContain("round_trip");
  });

  it("mentions cheapest preference", () => {
    const prompt = buildSG1UserPrompt(mockTrip);
    expect(prompt).toContain("cheapest option");
  });

  it("falls back to destinationCity if country is null", () => {
    const tripWithCity: Trip = {
      ...mockTrip,
      destinationCountry: null,
      destinationCity: "Tokyo",
    };
    const prompt = buildSG1UserPrompt(tripWithCity);
    expect(prompt).toContain("Tokyo");
  });
});
