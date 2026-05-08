/**
 * @jest-environment node
 */
import { AppError, Errors } from "@/lib/errors";

describe("AppError", () => {
  it("stores statusCode and message", () => {
    const err = new AppError(404, "Not found", "NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.name).toBe("AppError");
  });
});

describe("Errors helpers", () => {
  it("creates 404 not found", () => {
    const err = Errors.notFound("Trip");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("Trip");
  });

  it("creates 401 unauthorized", () => {
    expect(Errors.unauthorized().statusCode).toBe(401);
  });

  it("creates 400 bad request", () => {
    expect(Errors.badRequest("missing field").statusCode).toBe(400);
  });

  it("creates 409 conflict", () => {
    expect(Errors.conflict("already exists").statusCode).toBe(409);
  });

  it("creates 429 too many requests", () => {
    expect(Errors.tooManyRequests().statusCode).toBe(429);
  });

  it("creates 503 service unavailable", () => {
    const err = Errors.serviceUnavailable("Kiwi");
    expect(err.statusCode).toBe(503);
    expect(err.message).toContain("Kiwi");
  });
});
