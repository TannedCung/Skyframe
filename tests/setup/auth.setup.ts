import { test as setup, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";
import path from "path";
import fs from "fs";

const authFile = path.join(__dirname, ".auth/user.json");

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

setup("create authenticated session via JWT cookie", async ({ page, context }) => {
  const envVars = readEnvFile(path.resolve(__dirname, "../../.env.local"));
  const secret = envVars["NEXTAUTH_SECRET"] ?? process.env["NEXTAUTH_SECRET"] ?? "your-secret-here";
  const dbUrl = envVars["DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";

  // Upsert test user in DB and get their ID
  const sql = neon(dbUrl);
  const rows = await sql`
    INSERT INTO users (email, name)
    VALUES ('e2etest@skyframe.app', 'E2E Test User')
    ON CONFLICT (email)
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  const userId = (rows[0] as { id: string }).id;

  await page.goto("/login");

  // Encode a NextAuth JWT with the real DB user ID
  const sessionToken = await encode({
    token: {
      email: "e2etest@skyframe.app",
      name: "E2E Test User",
      picture: null,
      sub: "e2etest@skyframe.app",
      userId,
    },
    secret,
    maxAge: 30 * 24 * 60 * 60,
  });

  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    },
  ]);

  await page.goto("/dashboard");
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByText(/my trips/i)).toBeVisible({ timeout: 10000 });

  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await context.storageState({ path: authFile });
});
