#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import * as tasks from './tools/tasks.js';
import * as projects from './tools/projects.js';
import * as sections from './tools/sections.js';
import * as comments from './tools/comments.js';
import * as completed from './tools/completed.js';
import * as labels from './tools/labels.js';

const server = new McpServer({
  name: 'todoist-mcp',
  version: '1.0.0',
});

server.tool(
  'todoist_list_tasks',
  'List active tasks with optional filters (project, section, label, or Todoist filter query)',
  {
    project_id: z.string().optional().describe('Filter by project ID'),
    section_id: z.string().optional().describe('Filter by section ID'),
    label: z.string().optional().describe('Filter by label name'),
    filter: z.string().optional().describe('Todoist filter query (e.g., "today", "overdue", "p1")'),
    lang: z.string().optional().describe('Language for filter if not English'),
    ids: z.array(z.string()).optional().describe('Specific task IDs to retrieve'),
  },
  async (params) => {
    const result = await tasks.listTasks(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_get_task',
  'Get a single task by ID',
  {
    task_id: z.string().describe('The task ID'),
  },
  async ({ task_id }) => {
    const result = await tasks.getTask(task_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_create_task',
  'Create a new task with optional due date, priority, labels, and project/section assignment',
  {
    content: z.string().describe('Task content (supports markdown)'),
    description: z.string().optional().describe('Task description (supports markdown)'),
    project_id: z.string().optional().describe('Project ID (defaults to Inbox)'),
    section_id: z.string().optional().describe('Section ID'),
    parent_id: z.string().optional().describe('Parent task ID for subtasks'),
    order: z.number().optional().describe('Task order'),
    labels: z.array(z.string()).optional().describe('Label names'),
    priority: z.number().min(1).max(4).optional().describe('Priority: 1 (normal) to 4 (urgent)'),
    due_string: z.string().optional().describe('Natural language due date (e.g., "tomorrow at 3pm")'),
    due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    due_datetime: z.string().optional().describe('Due datetime in RFC3339 format'),
    due_lang: z.string().optional().describe('Language for due_string'),
    assignee_id: z.string().optional().describe('Assignee user ID (shared tasks)'),
    duration: z.number().optional().describe('Duration amount'),
    duration_unit: z.enum(['minute', 'day']).optional().describe('Duration unit'),
  },
  async (params) => {
    const result = await tasks.createTask(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_update_task',
  'Update an existing task',
  {
    task_id: z.string().describe('The task ID to update'),
    content: z.string().optional().describe('New task content'),
    description: z.string().optional().describe('New description'),
    labels: z.array(z.string()).optional().describe('New labels (replaces existing)'),
    priority: z.number().min(1).max(4).optional().describe('New priority'),
    due_string: z.string().optional().describe('New due date (natural language)'),
    due_date: z.string().optional().describe('New due date (YYYY-MM-DD)'),
    due_datetime: z.string().optional().describe('New due datetime (RFC3339)'),
    due_lang: z.string().optional().describe('Language for due_string'),
    assignee_id: z.string().nullable().optional().describe('New assignee (null to unassign)'),
    duration: z.number().nullable().optional().describe('New duration'),
    duration_unit: z.enum(['minute', 'day']).nullable().optional().describe('New duration unit'),
  },
  async ({ task_id, ...params }) => {
    const result = await tasks.updateTask(task_id, params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_complete_task',
  'Mark a task as completed',
  {
    task_id: z.string().describe('The task ID to complete'),
  },
  async ({ task_id }) => {
    const result = await tasks.completeTask(task_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_reopen_task',
  'Reopen a completed task',
  {
    task_id: z.string().describe('The task ID to reopen'),
  },
  async ({ task_id }) => {
    const result = await tasks.reopenTask(task_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_delete_task',
  'Delete a task permanently',
  {
    task_id: z.string().describe('The task ID to delete'),
  },
  async ({ task_id }) => {
    const result = await tasks.deleteTask(task_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_move_task',
  'Move a task to a different project, section, or parent',
  {
    task_id: z.string().describe('The task ID to move'),
    project_id: z.string().optional().describe('Target project ID'),
    section_id: z.string().optional().describe('Target section ID'),
    parent_id: z.string().optional().describe('Target parent task ID'),
  },
  async (params) => {
    const result = await tasks.moveTask(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_create_tasks_batch',
  'Create multiple tasks at once (uses parallel API calls)',
  {
    tasks: z.array(z.object({
      content: z.string().describe('Task content'),
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
      assignee_id: z.string().optional(),
      duration: z.number().optional(),
      duration_unit: z.enum(['minute', 'day']).optional(),
    })).describe('Array of task definitions'),
  },
  async ({ tasks: taskList }) => {
    const result = await tasks.createTasksBatch(taskList);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_search_tasks',
  'Search for tasks by content using Todoist search filter',
  {
    query: z.string().describe('Search query'),
    project_id: z.string().optional().describe('Limit search to project'),
    section_id: z.string().optional().describe('Limit search to section'),
    label: z.string().optional().describe('Filter by label'),
  },
  async ({ query, ...params }) => {
    const result = await tasks.searchTasks(query, params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_list_projects',
  'List all projects',
  {},
  async () => {
    const result = await projects.listProjects();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_get_project',
  'Get a project by ID',
  {
    project_id: z.string().describe('The project ID'),
  },
  async ({ project_id }) => {
    const result = await projects.getProject(project_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_create_project',
  'Create a new project',
  {
    name: z.string().describe('Project name'),
    parent_id: z.string().optional().describe('Parent project ID'),
    color: z.string().optional().describe('Project color (e.g., "red", "blue")'),
    is_favorite: z.boolean().optional().describe('Mark as favorite'),
    view_style: z.enum(['list', 'board']).optional().describe('Display style'),
  },
  async (params) => {
    const result = await projects.createProject(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_update_project',
  'Update a project',
  {
    project_id: z.string().describe('The project ID to update'),
    name: z.string().optional().describe('New name'),
    color: z.string().optional().describe('New color'),
    is_favorite: z.boolean().optional().describe('Favorite status'),
    view_style: z.enum(['list', 'board']).optional().describe('Display style'),
  },
  async ({ project_id, ...params }) => {
    const result = await projects.updateProject(project_id, params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_delete_project',
  'Delete a project permanently',
  {
    project_id: z.string().describe('The project ID to delete'),
  },
  async ({ project_id }) => {
    const result = await projects.deleteProject(project_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_list_sections',
  'List all sections (optionally filtered by project)',
  {
    project_id: z.string().optional().describe('Filter by project ID'),
  },
  async ({ project_id }) => {
    const result = await sections.listSections(project_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_get_section',
  'Get a section by ID',
  {
    section_id: z.string().describe('The section ID'),
  },
  async ({ section_id }) => {
    const result = await sections.getSection(section_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_create_section',
  'Create a new section in a project',
  {
    name: z.string().describe('Section name'),
    project_id: z.string().describe('Project ID'),
    order: z.number().optional().describe('Section order'),
  },
  async (params) => {
    const result = await sections.createSection(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_update_section',
  'Update a section name',
  {
    section_id: z.string().describe('The section ID to update'),
    name: z.string().describe('New section name'),
  },
  async ({ section_id, name }) => {
    const result = await sections.updateSection(section_id, name);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_delete_section',
  'Delete a section',
  {
    section_id: z.string().describe('The section ID to delete'),
  },
  async ({ section_id }) => {
    const result = await sections.deleteSection(section_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_list_comments',
  'List comments for a task or project',
  {
    task_id: z.string().optional().describe('Task ID (required if no project_id)'),
    project_id: z.string().optional().describe('Project ID (required if no task_id)'),
  },
  async (params) => {
    const result = await comments.listComments(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_get_comment',
  'Get a comment by ID',
  {
    comment_id: z.string().describe('The comment ID'),
  },
  async ({ comment_id }) => {
    const result = await comments.getComment(comment_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_create_comment',
  'Create a comment on a task or project with optional prefix tags',
  {
    content: z.string().describe('Comment content (supports markdown)'),
    task_id: z.string().optional().describe('Task ID (required if no project_id)'),
    project_id: z.string().optional().describe('Project ID (required if no task_id)'),
    prefix: z.enum(['[Research]', '[Prompt]', '[Context]', '[Note]', '[Summary]', '']).optional()
      .describe('Optional prefix tag for categorization'),
    attachment: z.object({
      file_url: z.string(),
      file_type: z.string(),
      file_name: z.string(),
    }).optional().describe('File attachment metadata'),
  },
  async (params) => {
    const result = await comments.createComment(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_update_comment',
  'Update a comment',
  {
    comment_id: z.string().describe('The comment ID to update'),
    content: z.string().describe('New comment content'),
    prefix: z.enum(['[Research]', '[Prompt]', '[Context]', '[Note]', '[Summary]', '']).optional()
      .describe('Optional prefix tag'),
  },
  async ({ comment_id, ...params }) => {
    const result = await comments.updateComment(comment_id, params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_delete_comment',
  'Delete a comment',
  {
    comment_id: z.string().describe('The comment ID to delete'),
  },
  async ({ comment_id }) => {
    const result = await comments.deleteComment(comment_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_add_research_comment',
  'Add a research note to a task (prefixed with [Research])',
  {
    task_id: z.string().describe('The task ID'),
    research: z.string().describe('Research content (supports markdown)'),
  },
  async ({ task_id, research }) => {
    const result = await comments.addResearchComment(task_id, research);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_add_context_comment',
  'Add context information to a task (prefixed with [Context])',
  {
    task_id: z.string().describe('The task ID'),
    context: z.string().describe('Context content (supports markdown)'),
  },
  async ({ task_id, context }) => {
    const result = await comments.addContextComment(task_id, context);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_list_completed_tasks',
  'List completed tasks (uses Sync API) with optional filters',
  {
    project_id: z.string().optional().describe('Filter by project ID'),
    section_id: z.string().optional().describe('Filter by section ID'),
    limit: z.number().optional().describe('Max tasks to return (default 50)'),
    offset: z.number().optional().describe('Pagination offset'),
    since: z.string().optional().describe('Return tasks completed since this date (RFC3339)'),
    until: z.string().optional().describe('Return tasks completed before this date (RFC3339)'),
    annotate_notes: z.boolean().optional().describe('Include task notes'),
  },
  async (params) => {
    const result = await completed.listCompletedTasks(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_get_completed_stats',
  'Get statistics about completed tasks',
  {
    project_id: z.string().optional().describe('Filter by project ID'),
  },
  async ({ project_id }) => {
    const result = await completed.getCompletedTaskStats(project_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_list_labels',
  'List all personal labels',
  {},
  async () => {
    const result = await labels.listLabels();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_create_label',
  'Create a new label',
  {
    name: z.string().describe('Label name'),
    color: z.string().optional().describe('Label color'),
    order: z.number().optional().describe('Label order'),
    is_favorite: z.boolean().optional().describe('Mark as favorite'),
  },
  async (params) => {
    const result = await labels.createLabel(params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_update_label',
  'Update a label',
  {
    label_id: z.string().describe('The label ID to update'),
    name: z.string().optional().describe('New name'),
    color: z.string().optional().describe('New color'),
    order: z.number().optional().describe('New order'),
    is_favorite: z.boolean().optional().describe('Favorite status'),
  },
  async ({ label_id, ...params }) => {
    const result = await labels.updateLabel(label_id, params);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'todoist_delete_label',
  'Delete a label',
  {
    label_id: z.string().describe('The label ID to delete'),
  },
  async ({ label_id }) => {
    const result = await labels.deleteLabel(label_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Todoist MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
