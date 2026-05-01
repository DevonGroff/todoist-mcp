import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { createResponse, handleApiError } from "./api-client.js";
import type { ToolResponse } from "../types/index.js";

export function toMcpToolResult(result: ToolResponse): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    ...(result.success ? {} : { isError: true }),
  };
}

export async function runTool<T>(
  handler: () => Promise<ToolResponse<T>> | ToolResponse<T>,
): Promise<CallToolResult> {
  try {
    return toMcpToolResult(await handler());
  } catch (error) {
    return toMcpToolResult(
      createResponse(false, undefined, handleApiError(error)),
    );
  }
}
