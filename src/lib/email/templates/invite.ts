const APP_URL = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000";

export function inviteEmail(params: {
  tripId: string;
  tripTitle: string;
  destination: string;
  inviterName: string;
  inviteToken: string;
  startDate: string;
  endDate: string;
}): { subject: string; html: string; text: string } {
  const acceptUrl = `${APP_URL}/trip/${params.tripId}?invite_token=${params.inviteToken}`;

  const subject = `${params.inviterName} shared a trip with you — ${params.tripTitle}`;

  const text = `
${params.inviterName} has shared a Skyframe trip with you!

Trip: ${params.tripTitle}
Destination: ${params.destination}
Dates: ${params.startDate} to ${params.endDate}

View the trip and get real-time price updates: ${acceptUrl}

Skyframe
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Skyframe — You're invited</title>
</head>
<body style="margin:0;padding:32px 28px;font-family:'Geist',ui-sans-serif,system-ui,sans-serif;background:#FFF6DE;color:#6B5A4D;min-height:100%;">
  <div style="max-width:540px;margin:0 auto;background:#FFF6DE;border-radius:18px;border:1px solid #EFE4C8;overflow:hidden;box-shadow:0 12px 36px rgba(60,40,20,.10);">
    <!-- Header strip -->
    <div style="background:#FFF6DE;padding:18px 24px;border-bottom:1px solid #EFE4C8;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:16px;letter-spacing:-0.02em;color:#2A1E15;display:inline-flex;align-items:center;gap:8px;">
        <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="#FFF6DE"/>
          <g transform="translate(11,11)">
            <rect x="0" y="0" width="42" height="42" rx="4" fill="none" stroke="#2A1E15" stroke-width="2.5"/>
            <line x1="0" y1="11" x2="42" y2="11" stroke="#2A1E15" stroke-width="2.5"/>
            <rect x="1.5" y="12.5" width="39" height="11" fill="#8BDFDD"/>
            <rect x="1.5" y="23.5" width="39" height="17" fill="#FFE394"/>
            <circle cx="30" cy="20" r="5.5" fill="#F48F68"/>
          </g>
        </svg>
        Skyframe
      </span>
      <span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;text-transform:uppercase;letter-spacing:0.14em;color:#968471;">An invitation</span>
    </div>

    <!-- Hero -->
    <div style="position:relative;aspect-ratio:16/9;overflow:hidden;background:linear-gradient(160deg,#8BDFDD,#F48F68);">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(20,12,4,.5) 100%);"></div>
      <div style="position:absolute;left:24px;bottom:18px;color:#FFF6DE;">
        <span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:9.5px;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,246,222,.85);">
          ${params.startDate} — ${params.endDate} · 9 nights
        </span>
        <div style="font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:28px;line-height:1;color:#FFF6DE;margin-top:2px;">
          ${params.tripTitle}
        </div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:26px 28px 28px;">
      <h2 style="margin:0 0 14px;font-family:'Newsreader',Georgia,serif;font-weight:500;font-size:28px;line-height:1.1;color:#2A1E15;letter-spacing:-0.01em;">
        ${params.inviterName} shared a trip with you.
      </h2>
      <p style="margin:0;font-size:15px;line-height:1.55;color:#6B5A4D;">
        They&#39;re drafting <em style="font-style:italic;color:#2A1E15;">&ldquo;${params.tripTitle}&rdquo;</em> in Skyframe and added you as a co-traveler. You can see their current plan, leave notes, and get a nudge if the flight price changes.
      </p>

      <!-- Detail card -->
      <div style="margin-top:22px;padding:16px 18px;border-radius:14px;background:#FFF6DE;border:1px solid #EFE4C8;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;text-transform:uppercase;letter-spacing:0.14em;color:#968471;padding:4px 14px 4px 0;vertical-align:top;">Route</td>
            <td style="font-family:'Geist Mono',ui-monospace,monospace;color:#2A1E15;padding:4px 0;">${params.destination}</td>
          </tr>
          <tr>
            <td style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;text-transform:uppercase;letter-spacing:0.14em;color:#968471;padding:4px 14px 4px 0;vertical-align:top;">Dates</td>
            <td style="color:#4A3A2E;padding:4px 0;">${params.startDate} — ${params.endDate}</td>
          </tr>
        </table>
      </div>

      <!-- CTA -->
      <a href="${acceptUrl}" style="display:inline-block;margin-top:24px;padding:13px 22px;border-radius:9999px;background:#F48F68;color:#2A1E15;font-weight:600;font-size:14px;text-decoration:none;">
        Open the trip &rarr;
      </a>
      <div style="margin-top:14px;">
        <span style="font-size:12px;color:#968471;">Or paste this link: <span style="font-family:'Geist Mono',ui-monospace,monospace;">${acceptUrl}</span></span>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;border-top:1px solid #EFE4C8;background:#FFF6DE;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;text-transform:uppercase;letter-spacing:0.14em;color:#968471;">Skyframe &middot; AI travel planning</span>
      <span style="font-size:11px;color:#968471;">Unsubscribe &middot; Email prefs</span>
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, html, text };
}
