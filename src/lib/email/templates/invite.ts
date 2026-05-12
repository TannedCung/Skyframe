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
<body style="font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #FFFAEC; color: #6B5A4D;">
  <h2 style="color: #2A1E15;">${params.inviterName} shared a trip with you!</h2>
  <div style="background: #FFF6DE; padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid #EFE4C8;">
    <h3 style="margin: 0 0 10px; color: #2A1E15;">${params.tripTitle}</h3>
    <p style="margin: 4px 0;">📍 ${params.destination}</p>
    <p style="margin: 4px 0;">📅 ${params.startDate} → ${params.endDate}</p>
    <p style="margin: 4px 0;">💰 From ${params.currency} ${params.price.toFixed(2)}</p>
  </div>
  <a href="${acceptUrl}" style="background: #F48F68; color: #2A1E15; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
    View Trip &amp; Watch Price Updates
  </a>
  <p style="color: #968471; font-size: 12px; margin-top: 20px;">Skyframe — AI-powered travel planning</p>
</body>
</html>
`.trim();

  return { subject, html, text };
}
