import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TodoistTask } from "../src/types/index.js";

const { getApiClientMock, mockClient } = vi.hoisted(() => {
  const mockClient = {
    get: vi.fn(),
    getAllPaginated: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    postMultipart: vi.fn(),
  };

  return {
    mockClient,
    getApiClientMock: vi.fn(() => mockClient),
  };
});

vi.mock("../src/utils/api-client.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/utils/api-client.js")>();
  return {
    ...actual,
    getApiClient: getApiClientMock,
  };
});

import { createTasksBatch, listTasks } from "../src/tools/tasks.js";

function makeTask(overrides: Partial<TodoistTask> = {}): TodoistTask {
  return {
    id: "task-1",
    user_id: "user-1",
    project_id: "project-1",
    section_id: null,
    parent_id: null,
    content: "Task",
    description: "",
    labels: [],
    priority: 1,
    due: null,
    deadline: null,
    duration: null,
    checked: false,
    is_deleted: false,
    added_at: "2026-04-30T12:00:00Z",
    added_by_uid: null,
    assigned_by_uid: null,
    responsible_uid: null,
    completed_at: null,
    completed_by_uid: null,
    updated_at: "2026-04-30T12:00:00Z",
    child_order: 1,
    day_order: -1,
    note_count: 0,
    is_collapsed: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getApiClientMock.mockReturnValue(mockClient);
});

describe("listTasks", () => {
  it("uses Todoist filter endpoint and preserves manual pagination cursors", async () => {
    const task = makeTask({ id: "task-filtered", content: "Filtered task" });
    mockClient.get.mockResolvedValue({
      results: [task],
      next_cursor: "next-page",
    });

    const result = await listTasks({
      filter: "overdue",
      lang: "en",
      limit: 50,
      cursor: "cursor-1",
    });

    expect(mockClient.get).toHaveBeenCalledWith("/tasks/filter", {
      query: "overdue",
      lang: "en",
      limit: 50,
      cursor: "cursor-1",
    });
    expect(result).toEqual({
      success: true,
      data: {
        results: [task],
        next_cursor: "next-page",
      },
    });
  });

  it("uses auto-pagination and joins id filters for regular task lists", async () => {
    const tasks = [
      makeTask({ id: "task-1", content: "First task" }),
      makeTask({ id: "task-2", content: "Second task" }),
    ];
    mockClient.getAllPaginated.mockResolvedValue(tasks);

    const result = await listTasks({
      project_id: "project-1",
      section_id: "section-1",
      label: "work",
      ids: ["task-1", "task-2"],
    });

    expect(mockClient.getAllPaginated).toHaveBeenCalledWith("/tasks", {
      project_id: "project-1",
      section_id: "section-1",
      label: "work",
      ids: "task-1,task-2",
    });
    expect(result).toEqual({ success: true, data: tasks });
  });
});

describe("createTasksBatch", () => {
  it("returns successful creates and indexed failures without aborting the batch", async () => {
    mockClient.post.mockImplementation(
      async (_endpoint: string, data: { content: string }) => {
        if (data.content === "fail") {
          throw new Error("Todoist unavailable");
        }

        return makeTask({ id: `task-${data.content}`, content: data.content });
      },
    );

    const result = await createTasksBatch([
      { content: "first", labels: ["work"] },
      { content: "fail" },
      { content: "third", priority: 4 },
    ]);

    expect(mockClient.post).toHaveBeenNthCalledWith(1, "/tasks", {
      content: "first",
      labels: ["work"],
    });
    expect(mockClient.post).toHaveBeenNthCalledWith(2, "/tasks", {
      content: "fail",
    });
    expect(mockClient.post).toHaveBeenNthCalledWith(3, "/tasks", {
      content: "third",
      priority: 4,
    });
    expect(result.success).toBe(true);
    expect(result.data?.created).toEqual([
      makeTask({ id: "task-first", content: "first" }),
      makeTask({ id: "task-third", content: "third" }),
    ]);
    expect(result.data?.failed).toEqual([
      {
        index: 1,
        error: {
          code: "INTERNAL_ERROR",
          message: "Todoist unavailable",
          retryable: false,
        },
      },
    ]);
  });
});
