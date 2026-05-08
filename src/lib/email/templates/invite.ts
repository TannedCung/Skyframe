const APP_URL = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000";

export function inviteEmail(params: {
  tripId: string;
  tripTitle: string;
  destination: string;
  inviterName: string;
  inviteToken: string;
  startDate: string;
  endDate: string;
  price: number;
  currency: string;
}): { subject: string; html: string; text: string } {
  const acceptUrl = `${APP_URL}/trip/${params.tripId}?invite_token=${params.inviteToken}`;

  const subject = `${params.inviterName} invited you to view their trip to ${params.destination}`;

  const text = `
${params.inviterName} has shared a Skyframe trip with you!

Trip: ${params.tripTitle}
Destination: ${params.destination}
Dates: ${params.startDate} to ${params.endDate}
Estimated price: ${params.currency} ${params.price.toFixed(2)}

View the trip and get real-time price updates: ${acceptUrl}

Skyframe
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>${params.inviterName} shared a trip with you!</h2>
  <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin: 0 0 10px;">${params.tripTitle}</h3>
    <p style="margin: 4px 0;">📍 ${params.destination}</p>
    <p style="margin: 4px 0;">📅 ${params.startDate} → ${params.endDate}</p>
    <p style="margin: 4px 0;">💰 From ${params.currency} ${params.price.toFixed(2)}</p>
  </div>
  <a href="${acceptUrl}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
    View Trip &amp; Watch Price Updates
  </a>
  <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">Skyframe — AI-powered travel planning</p>
</body>
</html>
`.trim();

  return { subject, html, text };
}
