#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import * as tasks from "./tools/tasks.js";
import * as projects from "./tools/projects.js";
import * as sections from "./tools/sections.js";
import * as comments from "./tools/comments.js";
import * as completed from "./tools/completed.js";
import * as labels from "./tools/labels.js";
import * as workspace from "./tools/workspace.js";
import * as discovery from "./tools/discovery.js";
import * as uploads from "./tools/uploads.js";
import { runTool } from "./utils/tool-result.js";

const server = new McpServer(
  {
    name: "todoist-mcp",
    version: "1.0.0",
  },
  {
    instructions: [
      "Start with todoist_get_workspace_overview to understand the workspace before other operations.",
      "Prefer batch tools (todoist_*_batch) for multi-item operations instead of calling single-item tools repeatedly.",
      "Use todoist_create_task_with_context instead of manually creating projects/sections first — it finds or creates them automatically.",
      "All tools return { success, data?, error? }. Check success before using data; errors include retryable and may include hint.",
      "If a tool returns error code NOT_CONFIGURED, the TODOIST_API_TOKEN environment variable is missing.",
    ].join(" "),
  },
);

// =============================================================================
// EFFICIENCY TOOLS - Use these first to minimize API calls
// =============================================================================

server.tool(
  "todoist_get_workspace_overview",
  "RECOMMENDED FIRST CALL: Fetches projects, sections, and tasks in parallel (3 API calls in 1 tool call). Use this to understand the workspace structure before other operations.",
  {
    project_id: z
      .string()
      .optional()
      .describe("Optional: limit to specific project"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async (params) => runTool(() => workspace.getWorkspaceOverview(params)),
);

server.tool(
  "todoist_create_task_with_context",
  "Smart task creation: Creates a task and automatically finds or creates the project/section by name. Use this instead of manually creating projects/sections first.",
  {
    content: z.string().describe("Task content"),
    description: z.string().optional().describe("Task description"),
    project_name: z
      .string()
      .optional()
      .describe("Project name (will find existing or create new)"),
    section_name: z
      .string()
      .optional()
      .describe("Section name (will find existing or create new)"),
    project_id: z
      .string()
      .optional()
      .describe("Project ID (use instead of project_name if you have it)"),
    section_id: z
      .string()
      .optional()
      .describe("Section ID (use instead of section_name if you have it)"),
    labels: z.array(z.string()).optional().describe("Label names"),
    priority: z.number().min(1).max(4).optional().describe("Priority 1-4"),
    due_string: z.string().optional().describe("Natural language due date"),
    due_date: z.string().optional().describe("Due date YYYY-MM-DD"),
  },
  { destructiveHint: false, openWorldHint: true },
  async (params) => runTool(() => workspace.createTaskWithContext(params)),
);

server.tool(
  "todoist_complete_and_create_followup",
  "Complete a task and create a follow-up task in one call. Can inherit project/section/labels from the original task.",
  {
    task_id: z.string().describe("Task ID to complete"),
    followup_content: z.string().describe("Follow-up task content"),
    followup_description: z
      .string()
      .optional()
      .describe("Follow-up description"),
    followup_due_string: z
      .string()
      .optional()
      .describe("Follow-up due date (natural language)"),
    followup_due_date: z
      .string()
      .optional()
      .describe("Follow-up due date YYYY-MM-DD"),
    followup_priority: z
      .number()
      .min(1)
      .max(4)
      .optional()
      .describe("Follow-up priority"),
    inherit_project: z
      .boolean()
      .optional()
      .describe("Copy project from completed task"),
    inherit_section: z
      .boolean()
      .optional()
      .describe("Copy section from completed task"),
    inherit_labels: z
      .boolean()
      .optional()
      .describe("Copy labels from completed task"),
  },
  { destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async (params) => runTool(() => workspace.completeAndCreateFollowup(params)),
);

server.tool(
  "todoist_get_projects_by_ids",
  "Fetch multiple projects by ID in parallel. More efficient than multiple get_project calls.",
  {
    project_ids: z.array(z.string()).describe("Array of project IDs"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ project_ids }) =>
    runTool(() => workspace.getProjectsByIds(project_ids)),
);

// =============================================================================
// BATCH OPERATIONS - Use when operating on multiple items
// =============================================================================

server.tool(
  "todoist_create_tasks_batch",
  "BATCH: Create multiple tasks in parallel. Use instead of multiple create_task calls.",
  {
    tasks: z
      .array(
        z.object({
          content: z.string().describe("Task content"),
          description: z.string().optional(),
          project_id: z.string().optional(),
          section_id: z.string().optional(),
          parent_id: z.string().optional(),
          order: z.number().optional(),
          labels: z.array(z.string()).optional(),
          priority: z.number().min(1).max(4).optional(),
          due_string: z.string().optional(),
          due_date: z.string().optional(),
          due_datetime: z.string().optional(),
          due_lang: z.string().optional(),
          deadline: z
            .object({ date: z.string(), lang: z.string().optional() })
            .optional(),
          assignee_id: z.string().optional(),
          duration: z.number().optional(),
          duration_unit: z.enum(["minute", "day"]).optional(),
        }),
      )
      .describe("Array of task definitions"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ tasks: taskList }) =>
    runTool(() => tasks.createTasksBatch(taskList)),
);

server.tool(
  "todoist_update_tasks_batch",
  "BATCH: Update multiple tasks in parallel. Use instead of multiple update_task calls.",
  {
    updates: z
      .array(
        z.object({
          task_id: z.string().describe("Task ID to update"),
          content: z.string().optional(),
          description: z.string().optional(),
          labels: z.array(z.string()).optional(),
          priority: z.number().min(1).max(4).optional(),
          due_string: z.string().optional(),
          due_date: z.string().optional(),
          due_datetime: z.string().optional(),
          due_lang: z.string().optional(),
          deadline: z
            .object({ date: z.string(), lang: z.string().optional() })
            .nullable()
            .optional(),
          assignee_id: z.string().nullable().optional(),
          duration: z.number().nullable().optional(),
          duration_unit: z.enum(["minute", "day"]).nullable().optional(),
        }),
      )
      .describe("Array of task updates"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ updates }) => runTool(() => tasks.updateTasksBatch(updates)),
);

server.tool(
  "todoist_complete_tasks_batch",
  "BATCH: Complete multiple tasks in parallel. Use instead of multiple complete_task calls.",
  {
    task_ids: z.array(z.string()).describe("Array of task IDs to complete"),
  },
  { destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async ({ task_ids }) => runTool(() => tasks.completeTasksBatch(task_ids)),
);

server.tool(
  "todoist_reopen_tasks_batch",
  "BATCH: Reopen multiple completed tasks in parallel.",
  {
    task_ids: z.array(z.string()).describe("Array of task IDs to reopen"),
  },
  { destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async ({ task_ids }) => runTool(() => tasks.reopenTasksBatch(task_ids)),
);

server.tool(
  "todoist_move_tasks_batch",
  "BATCH: Move multiple tasks in parallel. Use instead of multiple move_task calls. NOTE: Cannot change task content/properties - use update_task for that.",
  {
    moves: z
      .array(
        z.object({
          task_id: z.string().describe("Task ID to move"),
          project_id: z.string().optional().describe("Target project ID"),
          section_id: z.string().optional().describe("Target section ID"),
          parent_id: z.string().optional().describe("Target parent task ID"),
        }),
      )
      .describe("Array of move operations"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ moves }) => runTool(() => tasks.moveTasksBatch(moves)),
);

server.tool(
  "todoist_create_sections_batch",
  "BATCH: Create multiple sections in parallel.",
  {
    sections: z
      .array(
        z.object({
          name: z.string().describe("Section name"),
          project_id: z.string().describe("Project ID"),
          order: z.number().optional().describe("Section order"),
        }),
      )
      .describe("Array of section definitions"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ sections: sectionList }) =>
    runTool(() => sections.createSectionsBatch(sectionList)),
);

server.tool(
  "todoist_create_comments_batch",
  "BATCH: Create multiple comments in parallel. Useful for adding notes to multiple tasks at once.",
  {
    comments: z
      .array(
        z.object({
          content: z.string().describe("Comment content"),
          task_id: z.string().optional().describe("Task ID"),
          project_id: z.string().optional().describe("Project ID"),
          prefix: z
            .enum([
              "[Research]",
              "[Prompt]",
              "[Context]",
              "[Note]",
              "[Summary]",
              "",
            ])
            .optional(),
        }),
      )
      .describe("Array of comment definitions"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ comments: commentList }) =>
    runTool(() => comments.createCommentsBatch(commentList)),
);

// =============================================================================
// SINGLE ITEM OPERATIONS - Tasks
// =============================================================================

server.tool(
  "todoist_list_tasks",
  "List active tasks. Auto-paginates to return ALL tasks by default. For initial context, prefer todoist_get_workspace_overview instead. Use cursor/limit for manual pagination on large accounts.",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
    section_id: z.string().optional().describe("Filter by section ID"),
    label: z.string().optional().describe("Filter by label name"),
    filter: z
      .string()
      .optional()
      .describe('Todoist filter query (e.g., "today", "overdue", "p1")'),
    lang: z.string().optional().describe("Language for filter if not English"),
    ids: z
      .array(z.string())
      .optional()
      .describe("Specific task IDs to retrieve"),
    cursor: z
      .string()
      .optional()
      .describe(
        "Pagination cursor from previous response (disables auto-pagination)",
      ),
    limit: z
      .number()
      .min(1)
      .max(200)
      .optional()
      .describe("Max results per page, 1-200 (disables auto-pagination)"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async (params) => runTool(() => tasks.listTasks(params)),
);

server.tool(
  "todoist_get_task",
  "Get a single task by ID",
  {
    task_id: z.string().describe("The task ID"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ task_id }) => runTool(() => tasks.getTask(task_id)),
);

server.tool(
  "todoist_create_task",
  "Create a new task with optional due date, priority, labels, and project/section assignment",
  {
    content: z.string().describe("Task content (supports markdown)"),
    description: z
      .string()
      .optional()
      .describe("Task description (supports markdown)"),
    project_id: z
      .string()
      .optional()
      .describe("Project ID (defaults to Inbox)"),
    section_id: z.string().optional().describe("Section ID"),
    parent_id: z.string().optional().describe("Parent task ID for subtasks"),
    order: z.number().optional().describe("Task order"),
    labels: z.array(z.string()).optional().describe("Label names"),
    priority: z
      .number()
      .min(1)
      .max(4)
      .optional()
      .describe("Priority: 1 (normal) to 4 (urgent)"),
    due_string: z
      .string()
      .optional()
      .describe('Natural language due date (e.g., "tomorrow at 3pm")'),
    due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    due_datetime: z
      .string()
      .optional()
      .describe("Due datetime in RFC3339 format"),
    due_lang: z.string().optional().describe("Language for due_string"),
    deadline: z
      .object({
        date: z.string().describe("Deadline date YYYY-MM-DD"),
        lang: z.string().optional().describe("Language code"),
      })
      .optional()
      .describe(
        "Hard deadline (separate from due date). Shows countdown in Todoist.",
      ),
    assignee_id: z
      .string()
      .optional()
      .describe("Assignee user ID (shared tasks)"),
    duration: z.number().optional().describe("Duration amount"),
    duration_unit: z
      .enum(["minute", "day"])
      .optional()
      .describe("Duration unit"),
  },
  { destructiveHint: false, openWorldHint: true },
  async (params) => runTool(() => tasks.createTask(params)),
);

server.tool(
  "todoist_update_task",
  "Update an existing task",
  {
    task_id: z.string().describe("The task ID to update"),
    content: z.string().optional().describe("New task content"),
    description: z.string().optional().describe("New description"),
    labels: z
      .array(z.string())
      .optional()
      .describe("New labels (replaces existing)"),
    priority: z.number().min(1).max(4).optional().describe("New priority"),
    due_string: z
      .string()
      .optional()
      .describe("New due date (natural language)"),
    due_date: z.string().optional().describe("New due date (YYYY-MM-DD)"),
    due_datetime: z.string().optional().describe("New due datetime (RFC3339)"),
    due_lang: z.string().optional().describe("Language for due_string"),
    deadline: z
      .object({
        date: z.string().describe("Deadline date YYYY-MM-DD"),
        lang: z.string().optional().describe("Language code"),
      })
      .nullable()
      .optional()
      .describe("Hard deadline (null to remove). Shows countdown in Todoist."),
    assignee_id: z
      .string()
      .nullable()
      .optional()
      .describe("New assignee (null to unassign)"),
    duration: z.number().nullable().optional().describe("New duration"),
    duration_unit: z
      .enum(["minute", "day"])
      .nullable()
      .optional()
      .describe("New duration unit"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ task_id, ...params }) =>
    runTool(() => tasks.updateTask(task_id, params)),
);

server.tool(
  "todoist_complete_task",
  "Mark a task as completed",
  {
    task_id: z.string().describe("The task ID to complete"),
  },
  { destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async ({ task_id }) => runTool(() => tasks.completeTask(task_id)),
);

server.tool(
  "todoist_reopen_task",
  "Reopen a completed task",
  {
    task_id: z.string().describe("The task ID to reopen"),
  },
  { destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async ({ task_id }) => runTool(() => tasks.reopenTask(task_id)),
);

server.tool(
  "todoist_delete_task",
  "Delete a task permanently",
  {
    task_id: z.string().describe("The task ID to delete"),
  },
  { destructiveHint: true, openWorldHint: true },
  async ({ task_id }) => runTool(() => tasks.deleteTask(task_id)),
);

server.tool(
  "todoist_move_task",
  "Move a task to a different project, section, or parent",
  {
    task_id: z.string().describe("The task ID to move"),
    project_id: z.string().optional().describe("Target project ID"),
    section_id: z.string().optional().describe("Target section ID"),
    parent_id: z.string().optional().describe("Target parent task ID"),
  },
  { destructiveHint: false, openWorldHint: true },
  async (params) => runTool(() => tasks.moveTask(params)),
);

server.tool(
  "todoist_search_tasks",
  'Search for tasks using Todoist filter syntax (e.g., "today", "overdue", "p1", "@label").',
  {
    query: z.string().describe("Search query"),
    project_id: z.string().optional().describe("Limit search to project"),
    section_id: z.string().optional().describe("Limit search to section"),
    label: z.string().optional().describe("Filter by label"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ query, ...params }) =>
    runTool(() => tasks.searchTasks(query, params)),
);

// =============================================================================
// SINGLE ITEM OPERATIONS - Projects
// =============================================================================

server.tool(
  "todoist_list_projects",
  "List all projects. For full context, prefer todoist_get_workspace_overview instead.",
  {},
  { readOnlyHint: true, openWorldHint: true },
  async () => runTool(() => projects.listProjects()),
);

server.tool(
  "todoist_get_project",
  "Get a project by ID",
  {
    project_id: z.string().describe("The project ID"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ project_id }) => runTool(() => projects.getProject(project_id)),
);

server.tool(
  "todoist_create_project",
  "Create a new project",
  {
    name: z.string().describe("Project name"),
    parent_id: z.string().optional().describe("Parent project ID"),
    color: z
      .string()
      .optional()
      .describe('Project color (e.g., "red", "blue")'),
    is_favorite: z.boolean().optional().describe("Mark as favorite"),
    view_style: z.enum(["list", "board"]).optional().describe("Display style"),
  },
  { destructiveHint: false, openWorldHint: true },
  async (params) => runTool(() => projects.createProject(params)),
);

server.tool(
  "todoist_update_project",
  "Update a project",
  {
    project_id: z.string().describe("The project ID to update"),
    name: z.string().optional().describe("New name"),
    color: z.string().optional().describe("New color"),
    is_favorite: z.boolean().optional().describe("Favorite status"),
    view_style: z.enum(["list", "board"]).optional().describe("Display style"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ project_id, ...params }) =>
    runTool(() => projects.updateProject(project_id, params)),
);

server.tool(
  "todoist_delete_project",
  "Delete a project permanently",
  {
    project_id: z.string().describe("The project ID to delete"),
  },
  { destructiveHint: true, openWorldHint: true },
  async ({ project_id }) => runTool(() => projects.deleteProject(project_id)),
);

// =============================================================================
// SINGLE ITEM OPERATIONS - Sections
// =============================================================================

server.tool(
  "todoist_list_sections",
  "List sections. For full context, prefer todoist_get_workspace_overview instead.",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ project_id }) => runTool(() => sections.listSections(project_id)),
);

server.tool(
  "todoist_get_section",
  "Get a section by ID",
  {
    section_id: z.string().describe("The section ID"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ section_id }) => runTool(() => sections.getSection(section_id)),
);

server.tool(
  "todoist_create_section",
  "Create a new section in a project",
  {
    name: z.string().describe("Section name"),
    project_id: z.string().describe("Project ID"),
    order: z.number().optional().describe("Section order"),
  },
  { destructiveHint: false, openWorldHint: true },
  async (params) => runTool(() => sections.createSection(params)),
);

server.tool(
  "todoist_update_section",
  "Update a section name",
  {
    section_id: z.string().describe("The section ID to update"),
    name: z.string().describe("New section name"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ section_id, name }) =>
    runTool(() => sections.updateSection(section_id, name)),
);

server.tool(
  "todoist_delete_section",
  "Delete a section",
  {
    section_id: z.string().describe("The section ID to delete"),
  },
  { destructiveHint: true, openWorldHint: true },
  async ({ section_id }) => runTool(() => sections.deleteSection(section_id)),
);

// =============================================================================
// SINGLE ITEM OPERATIONS - Comments
// =============================================================================

server.tool(
  "todoist_list_comments",
  "List comments for a task or project. For multiple tasks, use todoist_create_comments_batch.",
  {
    task_id: z
      .string()
      .optional()
      .describe("Task ID (required if no project_id)"),
    project_id: z
      .string()
      .optional()
      .describe("Project ID (required if no task_id)"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async (params) => runTool(() => comments.listComments(params)),
);

server.tool(
  "todoist_get_comment",
  "Get a comment by ID",
  {
    comment_id: z.string().describe("The comment ID"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ comment_id }) => runTool(() => comments.getComment(comment_id)),
);

server.tool(
  "todoist_create_comment",
  "Create a comment on a task or project with optional prefix tags",
  {
    content: z.string().describe("Comment content (supports markdown)"),
    task_id: z
      .string()
      .optional()
      .describe("Task ID (required if no project_id)"),
    project_id: z
      .string()
      .optional()
      .describe("Project ID (required if no task_id)"),
    prefix: z
      .enum(["[Research]", "[Prompt]", "[Context]", "[Note]", "[Summary]", ""])
      .optional()
      .describe("Optional prefix tag for categorization"),
    attachment: z
      .object({
        file_url: z.string(),
        file_type: z.string(),
        file_name: z.string(),
      })
      .optional()
      .describe("File attachment metadata"),
  },
  { destructiveHint: false, openWorldHint: true },
  async (params) => runTool(() => comments.createComment(params)),
);

server.tool(
  "todoist_update_comment",
  "Update a comment",
  {
    comment_id: z.string().describe("The comment ID to update"),
    content: z.string().describe("New comment content"),
    prefix: z
      .enum(["[Research]", "[Prompt]", "[Context]", "[Note]", "[Summary]", ""])
      .optional()
      .describe("Optional prefix tag"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ comment_id, ...params }) =>
    runTool(() => comments.updateComment(comment_id, params)),
);

server.tool(
  "todoist_delete_comment",
  "Delete a comment",
  {
    comment_id: z.string().describe("The comment ID to delete"),
  },
  { destructiveHint: true, openWorldHint: true },
  async ({ comment_id }) => runTool(() => comments.deleteComment(comment_id)),
);

server.tool(
  "todoist_add_research_comment",
  "Add a research note to a task (prefixed with [Research])",
  {
    task_id: z.string().describe("The task ID"),
    research: z.string().describe("Research content (supports markdown)"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ task_id, research }) =>
    runTool(() => comments.addResearchComment(task_id, research)),
);

server.tool(
  "todoist_add_context_comment",
  "Add context information to a task (prefixed with [Context])",
  {
    task_id: z.string().describe("The task ID"),
    context: z.string().describe("Context content (supports markdown)"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ task_id, context }) =>
    runTool(() => comments.addContextComment(task_id, context)),
);

server.tool(
  "todoist_add_prompt_comment",
  "Add a prompt to a task (prefixed with [Prompt])",
  {
    task_id: z.string().describe("The task ID"),
    prompt: z.string().describe("Prompt content (supports markdown)"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ task_id, prompt }) =>
    runTool(() => comments.addPromptComment(task_id, prompt)),
);

// =============================================================================
// COMPLETED TASKS
// =============================================================================

server.tool(
  "todoist_list_completed_tasks",
  "List completed tasks (date range limited to 3 months). Returns different fields than active tasks.",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
    section_id: z.string().optional().describe("Filter by section ID"),
    limit: z.number().optional().describe("Max tasks to return (default 50)"),
    since: z
      .string()
      .optional()
      .describe("Return tasks completed since this date (RFC3339)"),
    until: z
      .string()
      .optional()
      .describe("Return tasks completed before this date (RFC3339)"),
    cursor: z
      .string()
      .optional()
      .describe("Pagination cursor from previous response"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async (params) => runTool(() => completed.listCompletedTasks(params)),
);

server.tool(
  "todoist_get_completed_stats",
  "Get statistics about completed tasks",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ project_id }) =>
    runTool(() => completed.getCompletedTaskStats(project_id)),
);

// =============================================================================
// LABELS
// =============================================================================

server.tool(
  "todoist_list_labels",
  "List all personal labels.",
  {},
  { readOnlyHint: true, openWorldHint: true },
  async () => runTool(() => labels.listLabels()),
);

server.tool(
  "todoist_get_label",
  "Get a label",
  {
    label_id: z.string().describe("The label ID"),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ label_id }) => runTool(() => labels.getLabel(label_id)),
);

server.tool(
  "todoist_create_label",
  "Create a new label",
  {
    name: z.string().describe("Label name"),
    color: z.string().optional().describe("Label color"),
    order: z.number().optional().describe("Label order"),
    is_favorite: z.boolean().optional().describe("Mark as favorite"),
  },
  { destructiveHint: false, openWorldHint: true },
  async (params) => runTool(() => labels.createLabel(params)),
);

server.tool(
  "todoist_update_label",
  "Update a label",
  {
    label_id: z.string().describe("The label ID to update"),
    name: z.string().optional().describe("New name"),
    color: z.string().optional().describe("New color"),
    order: z.number().optional().describe("New order"),
    is_favorite: z.boolean().optional().describe("Favorite status"),
  },
  { destructiveHint: false, openWorldHint: true },
  async ({ label_id, ...params }) =>
    runTool(() => labels.updateLabel(label_id, params)),
);

server.tool(
  "todoist_delete_label",
  "Delete a label",
  {
    label_id: z.string().describe("The label ID to delete"),
  },
  { destructiveHint: true, openWorldHint: true },
  async ({ label_id }) => runTool(() => labels.deleteLabel(label_id)),
);

// =============================================================================
// DISCOVERY TOOLS - Read-only analysis of task structure and duplicates
// =============================================================================

server.tool(
  "todoist_get_task_hierarchy",
  "Get a task with all its subtasks in a tree structure, including completion tracking. Walks up to the root parent and builds the full hierarchy.",
  {
    task_id: z
      .string()
      .describe(
        "Task ID to get hierarchy for (will find root parent automatically)",
      ),
  },
  { readOnlyHint: true, openWorldHint: true },
  async ({ task_id }) => runTool(() => discovery.getTaskHierarchy(task_id)),
);

server.tool(
  "todoist_find_duplicates",
  "Find duplicate or similar tasks using title similarity analysis. Returns grouped tasks sorted by similarity percentage. Read-only — does not modify any tasks.",
  {
    threshold: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        "Similarity threshold 0-100 (default 80). Tasks with similarity >= threshold are grouped.",
      ),
    project_id: z
      .string()
      .optional()
      .describe(
        "Limit search to a specific project ID. Omit to scan all tasks.",
      ),
  },
  { readOnlyHint: true, openWorldHint: true },
  async (params) => runTool(() => discovery.findDuplicates(params)),
);

// =============================================================================
// UPLOADS & ATTACHMENTS
// =============================================================================

server.tool(
  "todoist_upload_file",
  "Upload a local file to Todoist's CDN. Returns attachment metadata (file_url, file_name, file_size, file_type). Feed the metadata into todoist_create_comment.attachment to surface as a task or project attachment. For the common case of attaching a file to a task, prefer todoist_attach_file_to_task.",
  {
    file_path: z
      .string()
      .describe("Absolute local filesystem path to the file to upload"),
    file_name: z
      .string()
      .optional()
      .describe(
        "Override filename shown in Todoist (defaults to basename of file_path)",
      ),
    project_id: z
      .string()
      .optional()
      .describe("Optional project to associate the upload with"),
  },
  { destructiveHint: false, openWorldHint: true },
  async (params) => runTool(() => uploads.uploadFile(params)),
);

server.tool(
  "todoist_delete_upload",
  "Delete a previously uploaded file from Todoist's CDN by its file_url. Comments that reference the URL are not removed; the file_attachment metadata will still point at a dead URL.",
  {
    file_url: z
      .string()
      .describe("The file_url returned by todoist_upload_file"),
  },
  { destructiveHint: true, openWorldHint: true },
  async ({ file_url }) => runTool(() => uploads.deleteUpload(file_url)),
);

server.tool(
  "todoist_attach_file_to_task",
  "Attach a local file to a task (upload + create comment in one step). Todoist has no task-level attachment field in its API — attachments live on comments and render under the task in the UI.",
  {
    task_id: z.string().describe("Task ID to attach the file to"),
    file_path: z
      .string()
      .describe("Absolute local filesystem path to the file"),
    file_name: z
      .string()
      .optional()
      .describe("Override filename (defaults to basename of file_path)"),
    comment: z
      .string()
      .optional()
      .describe('Optional comment body (defaults to "Attached <file_name>")'),
  },
  { destructiveHint: false, openWorldHint: true },
  async (params) => runTool(() => uploads.attachFileToTask(params)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Todoist MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
