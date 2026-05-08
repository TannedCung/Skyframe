import { priceChangeEmail } from "@/lib/email/templates/price-change";
import { inviteEmail } from "@/lib/email/templates/invite";

describe("priceChangeEmail", () => {
  const params = {
    tripId: "trip-123",
    tripTitle: "Japan Adventure",
    oldPrice: 500,
    newPrice: 420,
    currency: "USD",
  };

  it("generates subject mentioning price drop", () => {
    const { subject } = priceChangeEmail(params);
    expect(subject).toContain("dropped");
    expect(subject).toContain("Japan Adventure");
  });

  it("generates subject mentioning price increase", () => {
    const { subject } = priceChangeEmail({ ...params, newPrice: 600 });
    expect(subject).toContain("increased");
  });

  it("includes trip link in text body", () => {
    const { text } = priceChangeEmail(params);
    expect(text).toContain("trip-123");
  });

  it("includes old and new prices in HTML", () => {
    const { html } = priceChangeEmail(params);
    expect(html).toContain("500.00");
    expect(html).toContain("420.00");
  });

  it("shows correct price difference", () => {
    const { text } = priceChangeEmail(params);
    expect(text).toContain("80.00");
  });
});

describe("inviteEmail", () => {
  const params = {
    tripId: "trip-456",
    tripTitle: "Tokyo Trip",
    destination: "Tokyo",
    inviterName: "Alice",
    inviteToken: "token-abc",
    startDate: "2025-03-01",
    endDate: "2025-03-10",
    price: 450,
    currency: "USD",
  };

  it("mentions inviter name in subject", () => {
    const { subject } = inviteEmail(params);
    expect(subject).toContain("Alice");
  });

  it("includes destination in subject", () => {
    const { subject } = inviteEmail(params);
    expect(subject).toContain("Tokyo");
  });

  it("includes invite token in HTML link", () => {
    const { html } = inviteEmail(params);
    expect(html).toContain("token-abc");
  });

  it("includes trip dates in HTML", () => {
    const { html } = inviteEmail(params);
    expect(html).toContain("2025-03-01");
    expect(html).toContain("2025-03-10");
  });
});
