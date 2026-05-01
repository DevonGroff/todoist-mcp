import { describe, expect, it } from "vitest";

import {
  createResponse,
  getBatchRecoveryHint,
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
        retryable: false,
        hint: "Review required parameters and use workspace overview or list tools to find valid Todoist IDs.",
      },
    });
  });
});

describe("getBatchRecoveryHint", () => {
  it("adds batch-level guidance when any failed item is retryable", () => {
    expect(
      getBatchRecoveryHint([
        {
          error: {
            code: "HTTP_503",
            message: "Service unavailable",
            retryable: true,
          },
        },
        {
          error: {
            code: "HTTP_400",
            message: "Bad request",
            retryable: false,
          },
        },
      ]),
    ).toEqual({
      retryable_failed_count: 1,
      hint: "Some batch items failed with retryable errors. Retry only the failed items after following each item's error hint.",
    });
  });

  it("omits batch-level guidance when no failed item is retryable", () => {
    expect(
      getBatchRecoveryHint([
        {
          error: {
            code: "HTTP_400",
            message: "Bad request",
            retryable: false,
          },
        },
      ]),
    ).toEqual({});
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
      retryable: false,
      hint: "Check that TODOIST_API_TOKEN is valid and has access to this resource.",
      details: { message: "Unauthorized token" },
    });
  });

  it("marks rate limit errors as retryable with recovery guidance", () => {
    const error = {
      isAxiosError: true,
      message: "Too many requests",
      response: {
        status: 429,
        data: { message: "Rate limited" },
      },
    };

    expect(handleApiError(error)).toEqual({
      code: "HTTP_429",
      message: "Rate limited",
      retryable: true,
      hint: "Todoist rate limit reached. Wait before retrying; use batch tools where possible.",
      details: { message: "Rate limited" },
    });
  });

  it("marks server errors as retryable", () => {
    const error = {
      isAxiosError: true,
      message: "Request failed",
      response: {
        status: 503,
        data: { message: "Service unavailable" },
      },
    };

    expect(handleApiError(error)).toEqual({
      code: "HTTP_503",
      message: "Service unavailable",
      retryable: true,
      hint: "Todoist service error. Retry later, preferably with exponential backoff.",
      details: { message: "Service unavailable" },
    });
  });

  it("marks validation and not found errors as non-retryable", () => {
    const badRequest = {
      isAxiosError: true,
      message: "Bad request",
      response: {
        status: 400,
        data: { message: "Invalid due date" },
      },
    };
    const notFound = {
      isAxiosError: true,
      message: "Not found",
      response: {
        status: 404,
        data: { message: "Task not found" },
      },
    };

    expect(handleApiError(badRequest)).toMatchObject({
      code: "HTTP_400",
      retryable: false,
      hint: "Check required parameters, date formats, and Todoist IDs before retrying.",
    });
    expect(handleApiError(notFound)).toMatchObject({
      code: "HTTP_404",
      retryable: false,
      hint: "Resource not found. List tasks, projects, or sections with filters to confirm the correct ID.",
    });
  });

  it("adds conflict and semantic validation recovery hints", () => {
    const conflict = {
      isAxiosError: true,
      message: "Conflict",
      response: {
        status: 409,
        data: { message: "Task state conflict" },
      },
    };
    const semanticValidation = {
      isAxiosError: true,
      message: "Unprocessable entity",
      response: {
        status: 422,
        data: { message: "Invalid duration unit" },
      },
    };

    expect(handleApiError(conflict)).toMatchObject({
      code: "HTTP_409",
      retryable: false,
      hint: "Resource state changed or conflicts with the request. Refresh the resource, then retry with current IDs and state.",
    });
    expect(handleApiError(semanticValidation)).toMatchObject({
      code: "HTTP_422",
      retryable: false,
      hint: "Todoist rejected the request semantics. Check field constraints like priority range, due or deadline format, duration unit, and mutually exclusive parameters.",
    });
  });

  it("marks network errors as retryable", () => {
    const error = {
      isAxiosError: true,
      message: "Network Error",
    };

    expect(handleApiError(error)).toEqual({
      code: "NETWORK_ERROR",
      message: "Network Error",
      retryable: true,
      hint: "Network error while contacting Todoist. Retry after checking connectivity.",
    });
  });

  it("preserves ordinary error messages", () => {
    expect(handleApiError(new Error("Network unavailable"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "Network unavailable",
      retryable: false,
    });
  });

  it("returns NOT_CONFIGURED for missing API token", () => {
    const result = handleApiError(new NotConfiguredError());
    expect(result.code).toBe("NOT_CONFIGURED");
    expect(result.message).toContain("TODOIST_API_TOKEN");
    expect(result.retryable).toBe(false);
    expect(result.hint).toContain("Set TODOIST_API_TOKEN");
  });

  it("returns a safe fallback for unknown thrown values", () => {
    expect(handleApiError("not an error")).toEqual({
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred",
      retryable: false,
      hint: "Retry with simpler inputs. If the error persists, inspect server logs.",
    });
  });
});
