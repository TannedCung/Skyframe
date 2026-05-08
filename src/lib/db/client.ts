import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env["NODE_ENV"] === "test"
    ? process.env["DATABASE_TEST_URL"]
    : process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL (or DATABASE_TEST_URL in test) is not set");
}

export const sql = neon(connectionString);
