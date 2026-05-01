import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";

import type { ToolError, ToolResponse } from "../types/index.js";

const API_BASE = "https://api.todoist.com/api/v1";

export class NotConfiguredError extends Error {
  constructor() {
    super(
      "Todoist API token is not configured. Set the TODOIST_API_TOKEN environment variable with your API token from https://app.todoist.com/app/settings/integrations/developer",
    );
    this.name = "NotConfiguredError";
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_PAGE_SIZE = 200;

class TodoistApiClient {
  private client: AxiosInstance;

  constructor(apiToken: string) {
    if (!apiToken) {
      throw new NotConfiguredError();
    }

    this.client = axios.create({
      baseURL: API_BASE,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;

          if (axiosError.response?.status === 429) {
            const retryAfter = parseInt(
              (axiosError.response.headers["retry-after"] as string) || "60",
              10,
            );
            await this.sleep(retryAfter * 1000);
            continue;
          }

          if (
            !axiosError.response ||
            (axiosError.response.status && axiosError.response.status >= 500)
          ) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            await this.sleep(delay);
            continue;
          }

          throw error;
        }

        throw error;
      }
    }

    throw lastError;
  }

  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    return this.withRetry(async () => {
      const config: AxiosRequestConfig = {};
      if (params) {
        config.params = params;
      }
      const response = await this.client.get<T>(endpoint, config);
      return response.data;
    });
  }

  async getAllPaginated<T>(
    endpoint: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const allResults: T[] = [];
    let cursor: string | null = null;

    do {
      const queryParams: Record<string, unknown> = {
        ...params,
        limit: MAX_PAGE_SIZE,
      };
      if (cursor) {
        queryParams.cursor = cursor;
      }

      const response = await this.get<{
        results: T[];
        next_cursor: string | null;
      }>(endpoint, queryParams);

      allResults.push(...response.results);
      cursor = response.next_cursor;
    } while (cursor);

    return allResults;
  }

  async post<T>(endpoint: string, data?: Record<string, unknown>): Promise<T> {
    return this.withRetry(async () => {
      const response = await this.client.post<T>(endpoint, data);
      return response.data;
    });
  }

  async postMultipart<T>(endpoint: string, form: FormData): Promise<T> {
    return this.withRetry(async () => {
      const response = await this.client.post<T>(endpoint, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data;
    });
  }

  async delete(
    endpoint: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    return this.withRetry(async () => {
      await this.client.delete(endpoint, data ? { data } : undefined);
    });
  }
}

let clientInstance: TodoistApiClient | null = null;

export function getApiClient(): TodoistApiClient {
  if (!clientInstance) {
    const token = process.env.TODOIST_API_TOKEN;
    if (!token) {
      throw new NotConfiguredError();
    }
    clientInstance = new TodoistApiClient(token);
  }
  return clientInstance;
}

export function createResponse<T>(success: true, data: T): ToolResponse<T>;
export function createResponse(
  success: false,
  data: undefined,
  error?: ToolErrorInput,
): ToolResponse<never>;
export function createResponse<T>(
  success: boolean,
  data?: T,
  error?: ToolErrorInput,
): ToolResponse<T> | ToolResponse<never> {
  if (success) {
    return { success: true, data: data as T };
  }
  return { success: false, error: normalizeToolError(error) };
}

type ToolErrorInput = {
  code: string;
  message: string;
  retryable?: boolean;
  hint?: string;
  details?: unknown;
};

function normalizeToolError(error?: ToolErrorInput): ToolError {
  if (!error) {
    return {
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred",
      retryable: false,
      hint: getToolErrorHint("UNKNOWN_ERROR"),
    };
  }

  const hint = error.hint ?? getToolErrorHint(error.code);

  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable ?? false,
    ...(hint ? { hint } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}

function getToolErrorHint(code: string): string | undefined {
  if (code === "INVALID_PARAMS") {
    return "Review required parameters and use workspace overview or list tools to find valid Todoist IDs.";
  }

  if (code === "PARTIAL_FAILURE") {
    return "Retry failed subsets individually or use narrower filters.";
  }

  if (code === "UNKNOWN_ERROR") {
    return "Retry with simpler inputs. If the error persists, inspect server logs.";
  }

  return undefined;
}

function getHttpErrorHint(status: number): string | undefined {
  if (status === 400) {
    return "Check required parameters, date formats, and Todoist IDs before retrying.";
  }

  if (status === 401 || status === 403) {
    return "Check that TODOIST_API_TOKEN is valid and has access to this resource.";
  }

  if (status === 404) {
    return "Resource not found. List tasks, projects, or sections with filters to confirm the correct ID.";
  }

  if (status === 409) {
    return "Resource state changed or conflicts with the request. Refresh the resource, then retry with current IDs and state.";
  }

  if (status === 422) {
    return "Todoist rejected the request semantics. Check field constraints like priority range, due or deadline format, duration unit, and mutually exclusive parameters.";
  }

  if (status === 429) {
    return "Todoist rate limit reached. Wait before retrying; use batch tools where possible.";
  }

  if (status >= 500) {
    return "Todoist service error. Retry later, preferably with exponential backoff.";
  }

  return undefined;
}

export function getBatchRecoveryHint(failed: Array<{ error: ToolError }>): {
  retryable_failed_count?: number;
  hint?: string;
} {
  const retryableFailedCount = failed.filter(
    ({ error }) => error.retryable,
  ).length;

  if (retryableFailedCount === 0) {
    return {};
  }

  return {
    retryable_failed_count: retryableFailedCount,
    hint: "Some batch items failed with retryable errors. Retry only the failed items after following each item's error hint.",
  };
}

function getAxiosErrorMessage(
  error: AxiosError<{ message?: string; error?: string }>,
): string {
  const data = error.response?.data;
  if (typeof data === "string") return data;
  return data?.message || data?.error || error.message;
}

export function handleApiError(error: unknown): ToolError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      message?: string;
      error?: string;
    }>;
    const status = axiosError.response?.status;
    const message = getAxiosErrorMessage(axiosError);

    if (!status) {
      return {
        code: "NETWORK_ERROR",
        message,
        retryable: true,
        hint: "Network error while contacting Todoist. Retry after checking connectivity.",
      };
    }

    return {
      code: `HTTP_${status}`,
      message,
      retryable: status === 429 || status >= 500,
      hint: getHttpErrorHint(status),
      details: axiosError.response?.data,
    };
  }

  if (error instanceof Error) {
    if (error instanceof NotConfiguredError) {
      return {
        code: "NOT_CONFIGURED",
        message: error.message,
        retryable: false,
        hint: "Set TODOIST_API_TOKEN and restart the MCP server.",
      };
    }

    return {
      code: "INTERNAL_ERROR",
      message: error.message,
      retryable: false,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "An unknown error occurred",
    retryable: false,
    hint: getToolErrorHint("UNKNOWN_ERROR"),
  };
}
