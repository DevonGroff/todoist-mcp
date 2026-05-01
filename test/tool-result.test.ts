import { describe, expect, it } from "vitest";

import { runTool, toMcpToolResult } from "../src/utils/tool-result.js";

describe("toMcpToolResult", () => {
  it("serializes successful tool responses without marking an MCP error", () => {
    const result = toMcpToolResult({
      success: true,
      data: { id: "task-1" },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { success: true, data: { id: "task-1" } },
            null,
            2,
          ),
        },
      ],
    });
  });

  it("marks failed tool responses as MCP-visible tool errors", () => {
    const response = {
      success: false,
      error: {
        code: "INVALID_PARAMS",
        message: "Either task_id or project_id is required",
        retryable: false,
      },
    };

    expect(toMcpToolResult(response)).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
      isError: true,
    });
  });
});

describe("runTool", () => {
  it("converts thrown handler exceptions into structured tool errors", async () => {
    const result = await runTool(() => {
      throw new Error("Boom");
    });

    expect(result.isError).toBe(true);
    expect(
      JSON.parse(
        result.content[0]?.type === "text" ? result.content[0].text : "",
      ),
    ).toEqual({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Boom",
        retryable: false,
      },
    });
  });
});
