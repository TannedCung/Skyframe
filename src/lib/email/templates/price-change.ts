const APP_URL = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000";

export function priceChangeEmail(params: {
  tripId: string;
  tripTitle: string;
  oldPrice: number;
  newPrice: number;
  currency: string;
}): { subject: string; html: string; text: string } {
  const diff = params.newPrice - params.oldPrice;
  const direction = diff < 0 ? "dropped" : "increased";
  const amount = Math.abs(diff).toFixed(2);
  const tripUrl = `${APP_URL}/trip/${params.tripId}`;

  const subject = `Your trip "${params.tripTitle}" price ${direction} by ${params.currency} ${amount}`;

  const text = `
Good news! Your Skyframe trip "${params.tripTitle}" has a price update.

Previous price: ${params.currency} ${params.oldPrice.toFixed(2)}
New price: ${params.currency} ${params.newPrice.toFixed(2)}
Change: ${diff < 0 ? "-" : "+"}${params.currency} ${amount}

View your updated itinerary: ${tripUrl}

Skyframe
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>Flight price ${direction} for "${params.tripTitle}"</h2>
  <table>
    <tr><td>Previous price:</td><td><strong>${params.currency} ${params.oldPrice.toFixed(2)}</strong></td></tr>
    <tr><td>New price:</td><td><strong>${params.currency} ${params.newPrice.toFixed(2)}</strong></td></tr>
    <tr><td>Change:</td><td style="color: ${diff < 0 ? "green" : "red"}"><strong>${diff < 0 ? "▼" : "▲"} ${params.currency} ${amount}</strong></td></tr>
  </table>
  <br/>
  <a href="${tripUrl}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
    View Updated Itinerary
  </a>
  <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">Skyframe — AI-powered travel planning</p>
</body>
</html>
`.trim();

  return { subject, html, text };
}
