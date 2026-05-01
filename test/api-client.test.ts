import { describe, expect, it } from "vitest";

import {
  createResponse,
  handleApiError,
  NotConfiguredError,
} from "../src/utils/api-client.js";

describe("createResponse", () => {
  it("wraps successful tool data consistently", () => {
    expect(createResponse(true, { id: "task-1" })).toEqual({
      success: true,
      data: { id: "task-1" },
    });
  });

  it("wraps tool errors consistently", () => {
    expect(
      createResponse(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing task id",
      }),
    ).toEqual({
      success: false,
      error: {
        code: "INVALID_PARAMS",
        message: "Missing task id",
      },
    });
  });
});

describe("handleApiError", () => {
  it("maps Todoist API errors to HTTP error responses", () => {
    const error = {
      isAxiosError: true,
      message: "Request failed",
      response: {
        status: 401,
        data: { message: "Unauthorized token" },
      },
    };

    expect(handleApiError(error)).toEqual({
      code: "HTTP_401",
      message: "Unauthorized token",
      details: { message: "Unauthorized token" },
    });
  });

  it("preserves ordinary error messages", () => {
    expect(handleApiError(new Error("Network unavailable"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "Network unavailable",
    });
  });

  it("returns NOT_CONFIGURED for missing API token", () => {
    const result = handleApiError(new NotConfiguredError());
    expect(result.code).toBe("NOT_CONFIGURED");
    expect(result.message).toContain("TODOIST_API_TOKEN");
  });

  it("returns a safe fallback for unknown thrown values", () => {
    expect(handleApiError("not an error")).toEqual({
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred",
    });
  });
});
