import pino from "pino";

const isTest = process.env["NODE_ENV"] === "test";
const isProduction = process.env["NODE_ENV"] === "production";

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? (isProduction ? "info" : "debug"),
  // Disable pretty transport in test (pino-pretty not installed) and production
  ...(process.env["PINO_PRETTY"] === "true" && !isTest
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

export default logger;
