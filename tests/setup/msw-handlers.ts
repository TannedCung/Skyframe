import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const kiwiHandlers = [
  http.get("https://api.tequila.kiwi.com/v2/search", () => {
    return HttpResponse.json({
      data: [
        {
          id: "mock-flight-1",
          price: 450,
          currency: "USD",
          utc_departure: "2025-03-01T06:00:00Z",
          utc_arrival: "2025-03-01T14:00:00Z",
          airlines: ["VN"],
          route: [
            {
              flyFrom: "HAN",
              flyTo: "NRT",
              local_departure: "2025-03-01T13:00:00Z",
              local_arrival: "2025-03-01T21:00:00Z",
              airline: "VN",
              flight_no: 50,
            },
          ],
          deep_link: "https://www.kiwi.com/booking?token=mock",
        },
      ],
      currency: "USD",
    });
  }),
];

export const anthropicHandlers = [
  http.post("https://api.anthropic.com/v1/messages", () => {
    return HttpResponse.json({
      id: "msg_mock",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            options: [
              {
                id: "opt-1",
                entryCity: "Tokyo",
                exitCity: "Osaka",
                approximateDates: { start: "2025-03-01", end: "2025-03-10" },
                theme: "food & culture",
                airports: { entry: "NRT", exit: "KIX" },
              },
            ],
          }),
        },
      ],
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 200 },
    });
  }),
];

export const sesHandlers = [
  http.post("https://email.us-east-1.amazonaws.com/", () => {
    return HttpResponse.xml(
      "<SendEmailResponse><MessageId>mock-id</MessageId></SendEmailResponse>",
    );
  }),
];

export const server = setupServer(...kiwiHandlers, ...anthropicHandlers, ...sesHandlers);
