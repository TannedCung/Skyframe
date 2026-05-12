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
<body style="font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #FFFAEC; color: #6B5A4D;">
  <h2 style="color: #2A1E15;">Flight price ${direction} for &quot;${params.tripTitle}&quot;</h2>
  <table style="border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 4px 12px 4px 0; color: #968471;">Previous price:</td><td style="padding: 4px 0;"><strong style="color: #2A1E15;">${params.currency} ${params.oldPrice.toFixed(2)}</strong></td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #968471;">New price:</td><td style="padding: 4px 0;"><strong style="color: #2A1E15;">${params.currency} ${params.newPrice.toFixed(2)}</strong></td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #968471;">Change:</td><td style="padding: 4px 0;"><strong style="color: ${diff < 0 ? "#2FA5A1" : "#D85A45"};">${diff < 0 ? "▼" : "▲"} ${params.currency} ${amount}</strong></td></tr>
  </table>
  <br/>
  <a href="${tripUrl}" style="background: #F48F68; color: #2A1E15; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
    View Updated Itinerary
  </a>
  <p style="color: #968471; font-size: 12px; margin-top: 20px;">Skyframe — AI-powered travel planning</p>
</body>
</html>
`.trim();

  return { subject, html, text };
}
