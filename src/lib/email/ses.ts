import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import logger from "@/lib/logger";

const ses = new SESClient({
  region: process.env["AWS_REGION"] ?? "us-east-1",
  credentials:
    process.env["AWS_ACCESS_KEY_ID"] && process.env["AWS_SECRET_ACCESS_KEY"]
      ? {
          accessKeyId: process.env["AWS_ACCESS_KEY_ID"],
          secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"],
        }
      : undefined,
});

const FROM_EMAIL = process.env["SES_FROM_EMAIL"] ?? "noreply@skyframe.app";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  logger.info({ to: params.to, subject: params.subject }, "Sending email");

  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: params.subject },
        Body: {
          Html: { Data: params.html },
          Text: { Data: params.text },
        },
      },
    }),
  );
}
