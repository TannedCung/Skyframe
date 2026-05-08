import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  notFound: (resource: string) => new AppError(404, `${resource} not found`),
  unauthorized: () => new AppError(401, "Unauthorized"),
  forbidden: () => new AppError(403, "Forbidden"),
  badRequest: (msg: string) => new AppError(400, msg),
  conflict: (msg: string) => new AppError(409, msg),
  tooManyRequests: () => new AppError(429, "Too many requests"),
  serviceUnavailable: (service: string) =>
    new AppError(503, `${service} is temporarily unavailable`),
};

export function apiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  console.error("Unhandled error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
