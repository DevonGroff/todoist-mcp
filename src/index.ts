#!/usr/bin/env node
/**
 * todoist-mcp v2 — unified Todoist API v1 server with a declarative tool registry.
 *
 * v2 rebuild (2026-07-05): tools are ToolDef data filtered by config.ts (mode/allow/deny)
 * before registration — destructive tools are NOT registered in the default 'standard'
 * mode. Payloads are slim by default (TODOIST_SLIM=0 for raw). New v1 surfaces: reminders,
 * saved filters, activity log, backups, user/productivity, natural-language quick-add.
 * `todoist_get_capabilities` audits the live surface.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadConfig } from './config.js';
import { ToolDef, envelope, registerAll } from './registry.js';
import {
  slimTask, slimProject, slimSection, slimComment, slimLabel,
  slimReminder, slimFilter, slimActivityEvent, shapeList, shapeOne,
} from './utils/shape.js';
import { createResponse } from './utils/api-client.js';

import {
  listTasks, getTask, createTask, updateTask, completeTask, reopenTask, deleteTask,
  moveTask, createTasksBatch, updateTasksBatch, completeTasksBatch, reopenTasksBatch,
  moveTasksBatch, searchTasks,
} from './tools/tasks.js';
import { listProjects, getProject, createProject, updateProject, deleteProject } from './tools/projects.js';
import {
  listSections, getSection, createSection, updateSection, deleteSection, createSectionsBatch,
} from './tools/sections.js';
import {
  listComments, getComment, createComment, updateComment, deleteComment,
  addResearchComment, addContextComment, createCommentsBatch,
} from './tools/comments.js';
import { listLabels, getLabel, createLabel, updateLabel, deleteLabel } from './tools/labels.js';
import { listCompletedTasks } from './tools/completed.js';
import { getTaskHierarchy, findDuplicates } from './tools/discovery.js';
import {
  getWorkspaceOverview, getProjectsByIds, createTaskWithContext, completeAndCreateFollowup,
} from './tools/workspace.js';
import {
  listReminders, createReminder, updateReminder, deleteReminder,
  listFilters, createFilter, updateFilter, deleteFilter,
  getActivity, listBackups, getUser, getProductivityStats, quickAddTask, countComments,
} from './tools/extras.js';

const PREFIX_ENUM = z.enum(['[Research]', '[Prompt]', '[Context]', '[Note]', '[Summary]', '']);

/** Shape helper for list_tasks-style payloads (array OR {results, next_cursor}). */
function shapeTasksPayload(data: any, slim: boolean): any {
  if (!slim || !data) return data;
  if (Array.isArray(data)) return data.map(slimTask);
  if (Array.isArray(data.results)) return { ...data, results: data.results.map(slimTask) };
  return data;
}

const taskCreateShape = {
  content: z.string().describe('Task title'),
  description: z.string().optional(),
  project_id: z.string().optional(),
  section_id: z.string().optional(),
  parent_id: z.string().optional(),
  order: z.number().optional(),
  labels: z.array(z.string()).optional(),
  priority: z.number().min(1).max(4).optional().describe('API value: 4=P1 urgent … 1=P4 untriaged (inverted from UI)'),
  due_string: z.string().optional().describe('Natural language due date'),
  due_date: z.string().optional().describe('YYYY-MM-DD'),
  due_datetime: z.string().optional().describe('RFC3339'),
  due_lang: z.string().optional(),
  deadline_date: z.string().optional().describe('Hard external deadline YYYY-MM-DD (separate from due date)'),
  deadline_lang: z.string().optional(),
  assignee_id: z.string().optional(),
  duration: z.number().optional(),
  duration_unit: z.enum(['minute', 'day']).optional(),
};

const defs: ToolDef[] = [
  // ── Tasks: reads ─────────────────────────────────────────────────────────────
  {
    name: 'todoist_list_tasks',
    tier: 'read',
    description: 'List active tasks. Scope with filter, project_id, section_id, label, or ids. Auto-paginates unless cursor/limit given.',
    schema: {
      project_id: z.string().optional(),
      section_id: z.string().optional(),
      label: z.string().optional(),
      filter: z.string().optional().describe('Todoist filter query, e.g. "today | overdue"'),
      lang: z.string().optional(),
      ids: z.array(z.string()).optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
    },
    handler: (args) => listTasks(args),
    shapeData: shapeTasksPayload,
  },
  {
    name: 'todoist_get_task',
    tier: 'read',
    description: 'Get one task by ID, augmented with an authoritative comment_count (the list-payload note_count is unreliable).',
    schema: { task_id: z.string() },
    handler: async ({ task_id }: { task_id: string }) => {
      const res = await getTask(task_id);
      if (!res.success || !res.data) return res;
      let comment_count: number | undefined;
      try { comment_count = await countComments(task_id); } catch { /* best-effort */ }
      return createResponse(true, { ...res.data, comment_count });
    },
    shapeData: (d, slim) => (slim ? { ...slimTask(d), comment_count: d.comment_count ?? 0 } : d),
  },
  {
    name: 'todoist_search_tasks',
    tier: 'read',
    description: 'Full-text task search, optionally narrowed by project_id, section_id, or label (applied post-search).',
    schema: {
      query: z.string(),
      project_id: z.string().optional(),
      section_id: z.string().optional(),
      label: z.string().optional(),
    },
    handler: async ({ query, project_id, section_id, label }: any) => {
      const res = await searchTasks(query);
      if (!res.success || !res.data) return res;
      let tasks = res.data as any[];
      if (project_id) tasks = tasks.filter(t => t.project_id === project_id);
      if (section_id) tasks = tasks.filter(t => t.section_id === section_id);
      if (label) tasks = tasks.filter(t => Array.isArray(t.labels) && t.labels.includes(label));
      return createResponse(true, tasks);
    },
    shapeData: (d, slim) => shapeList(d, slimTask, slim),
  },
  {
    name: 'todoist_get_task_hierarchy',
    tier: 'read',
    description: 'Full parent/child tree for a task with completion stats (walks up to the root, down to all descendants).',
    schema: { task_id: z.string() },
    handler: ({ task_id }: { task_id: string }) => getTaskHierarchy(task_id),
  },
  {
    name: 'todoist_find_duplicates',
    tier: 'read',
    description: 'Find likely-duplicate tasks by title similarity (Levenshtein), optionally scoped to a project.',
    schema: {
      threshold: z.number().min(0).max(100).optional().describe('Similarity % threshold, default 80'),
      project_id: z.string().optional(),
    },
    handler: (args) => findDuplicates(args),
  },

  // ── Tasks: writes ────────────────────────────────────────────────────────────
  {
    name: 'todoist_create_task',
    tier: 'write',
    description: 'Create a task.',
    schema: taskCreateShape,
    handler: (args) => createTask(args),
    shapeData: (d, slim) => shapeOne(d, slimTask, slim),
  },
  {
    name: 'todoist_update_task',
    tier: 'write',
    description: 'Update an existing task (labels replaces the whole set).',
    schema: {
      task_id: z.string(),
      content: z.string().optional(),
      description: z.string().optional(),
      labels: z.array(z.string()).optional(),
      priority: z.number().min(1).max(4).optional(),
      due_string: z.string().optional(),
      due_date: z.string().optional(),
      due_datetime: z.string().optional(),
      due_lang: z.string().optional(),
      deadline_date: z.string().optional(),
      deadline_lang: z.string().optional(),
      assignee_id: z.string().nullable().optional(),
      duration: z.number().nullable().optional(),
      duration_unit: z.enum(['minute', 'day']).nullable().optional(),
    },
    handler: ({ task_id, ...params }: any) => updateTask(task_id, params),
    shapeData: (d, slim) => shapeOne(d, slimTask, slim),
  },
  {
    name: 'todoist_quick_add',
    tier: 'write',
    description: 'Create a task from natural language exactly like the app quick-add box ("Call Mo tomorrow 4pm #Personal @quick p2").',
    schema: {
      text: z.string(),
      note: z.string().optional().describe('Becomes the first comment'),
      reminder: z.string().optional().describe('Natural-language reminder'),
      auto_reminder: z.boolean().optional(),
    },
    handler: (args) => envelope(() => quickAddTask(args)),
    shapeData: (d, slim) => shapeOne(d, slimTask, slim),
  },
  {
    name: 'todoist_complete_task',
    tier: 'write',
    description: 'Mark a task as completed.',
    schema: { task_id: z.string() },
    handler: ({ task_id }: { task_id: string }) => completeTask(task_id),
  },
  {
    name: 'todoist_move_task',
    tier: 'write',
    description: 'Move a task to a different project, section, or parent. NOTE: moving by section strips parent_id.',
    schema: {
      task_id: z.string(),
      project_id: z.string().optional(),
      section_id: z.string().optional(),
      parent_id: z.string().optional(),
    },
    handler: (args) => moveTask(args),
    shapeData: (d, slim) => shapeOne(d, slimTask, slim),
  },
  {
    name: 'todoist_complete_and_create_followup',
    tier: 'write',
    description: 'Atomically complete a task and create its follow-up (optionally inheriting project/section/labels).',
    schema: {
      task_id: z.string(),
      followup_content: z.string(),
      followup_description: z.string().optional(),
      followup_due_string: z.string().optional(),
      followup_due_date: z.string().optional(),
      followup_priority: z.number().min(1).max(4).optional(),
      inherit_project: z.boolean().optional(),
      inherit_section: z.boolean().optional(),
      inherit_labels: z.boolean().optional(),
    },
    handler: (args) => completeAndCreateFollowup(args),
  },
  {
    name: 'todoist_create_task_with_context',
    tier: 'write',
    description: 'Create a task, finding or creating the named project/section first.',
    schema: {
      content: z.string(),
      description: z.string().optional(),
      project_name: z.string().optional(),
      section_name: z.string().optional(),
      project_id: z.string().optional(),
      section_id: z.string().optional(),
      labels: z.array(z.string()).optional(),
      priority: z.number().min(1).max(4).optional(),
      due_string: z.string().optional(),
      due_date: z.string().optional(),
    },
    handler: (args) => createTaskWithContext(args),
  },

  // ── Tasks: batches ───────────────────────────────────────────────────────────
  {
    name: 'todoist_create_tasks_batch',
    tier: 'write',
    description: 'Create many tasks in one call; returns created + per-item failures.',
    schema: { tasks: z.array(z.object(taskCreateShape)) },
    handler: ({ tasks }: any) => createTasksBatch(tasks),
    shapeData: (d, slim) => (slim && d?.created ? { ...d, created: d.created.map(slimTask) } : d),
  },
  {
    name: 'todoist_update_tasks_batch',
    tier: 'write',
    description: 'Update many tasks in one call; returns updated + per-item failures.',
    schema: {
      updates: z.array(z.object({
        task_id: z.string(),
        content: z.string().optional(),
        description: z.string().optional(),
        labels: z.array(z.string()).optional(),
        priority: z.number().min(1).max(4).optional(),
        due_string: z.string().optional(),
        due_date: z.string().optional(),
        due_datetime: z.string().optional(),
        deadline_date: z.string().optional(),
        duration: z.number().nullable().optional(),
        duration_unit: z.enum(['minute', 'day']).nullable().optional(),
      })),
    },
    handler: ({ updates }: any) => updateTasksBatch(updates),
    shapeData: (d, slim) => (slim && d?.updated ? { ...d, updated: d.updated.map(slimTask) } : d),
  },
  {
    name: 'todoist_complete_tasks_batch',
    tier: 'write',
    description: 'Complete many tasks in one call.',
    schema: { task_ids: z.array(z.string()) },
    handler: ({ task_ids }: any) => completeTasksBatch(task_ids),
  },
  {
    name: 'todoist_move_tasks_batch',
    tier: 'write',
    description: 'Move many tasks in one call.',
    schema: {
      moves: z.array(z.object({
        task_id: z.string(),
        project_id: z.string().optional(),
        section_id: z.string().optional(),
        parent_id: z.string().optional(),
      })),
    },
    handler: ({ moves }: any) => moveTasksBatch(moves),
    shapeData: (d, slim) => (slim && d?.moved ? { ...d, moved: d.moved.map(slimTask) } : d),
  },

  // ── Tasks: destructive (NOT registered in standard mode) ────────────────────
  {
    name: 'todoist_delete_task',
    tier: 'destructive',
    description: 'Permanently delete a task (unrecoverable).',
    schema: { task_id: z.string() },
    handler: ({ task_id }: { task_id: string }) => deleteTask(task_id),
  },
  {
    name: 'todoist_reopen_task',
    tier: 'destructive',
    description: 'Reopen a completed task.',
    schema: { task_id: z.string() },
    handler: ({ task_id }: { task_id: string }) => reopenTask(task_id),
  },
  {
    name: 'todoist_reopen_tasks_batch',
    tier: 'destructive',
    description: 'Reopen many completed tasks.',
    schema: { task_ids: z.array(z.string()) },
    handler: ({ task_ids }: any) => reopenTasksBatch(task_ids),
  },

  // ── Projects ─────────────────────────────────────────────────────────────────
  {
    name: 'todoist_list_projects',
    tier: 'read',
    description: 'List all projects (structure + IDs).',
    schema: {},
    handler: () => listProjects(),
    shapeData: (d, slim) => shapeList(d, slimProject, slim),
  },
  {
    name: 'todoist_get_project',
    tier: 'read',
    description: 'Get one project by ID.',
    schema: { project_id: z.string() },
    handler: ({ project_id }: any) => getProject(project_id),
    shapeData: (d, slim) => shapeOne(d, slimProject, slim),
  },
  {
    name: 'todoist_get_projects_by_ids',
    tier: 'read',
    description: 'Get several projects by ID in one call.',
    schema: { project_ids: z.array(z.string()) },
    handler: ({ project_ids }: any) => getProjectsByIds(project_ids),
    shapeData: (d, slim) => (slim && d?.projects ? { ...d, projects: d.projects.map(slimProject) } : d),
  },
  {
    name: 'todoist_create_project',
    tier: 'write',
    description: 'Create a project.',
    schema: {
      name: z.string(),
      parent_id: z.string().optional(),
      color: z.string().optional(),
      is_favorite: z.boolean().optional(),
      view_style: z.enum(['list', 'board']).optional(),
    },
    handler: (args) => createProject(args),
    shapeData: (d, slim) => shapeOne(d, slimProject, slim),
  },
  {
    name: 'todoist_update_project',
    tier: 'write',
    description: 'Update a project.',
    schema: {
      project_id: z.string(),
      name: z.string().optional(),
      color: z.string().optional(),
      is_favorite: z.boolean().optional(),
      view_style: z.enum(['list', 'board']).optional(),
    },
    handler: ({ project_id, ...params }: any) => updateProject(project_id, params),
    shapeData: (d, slim) => shapeOne(d, slimProject, slim),
  },
  {
    name: 'todoist_delete_project',
    tier: 'destructive',
    description: 'Permanently delete a project and ALL its tasks (unrecoverable).',
    schema: { project_id: z.string() },
    handler: ({ project_id }: any) => deleteProject(project_id),
  },

  // ── Sections ─────────────────────────────────────────────────────────────────
  {
    name: 'todoist_list_sections',
    tier: 'read',
    description: 'List sections, optionally scoped to a project.',
    schema: { project_id: z.string().optional() },
    handler: ({ project_id }: any) => listSections(project_id),
    shapeData: (d, slim) => shapeList(d, slimSection, slim),
  },
  {
    name: 'todoist_get_section',
    tier: 'read',
    description: 'Get one section by ID.',
    schema: { section_id: z.string() },
    handler: ({ section_id }: any) => getSection(section_id),
    shapeData: (d, slim) => shapeOne(d, slimSection, slim),
  },
  {
    name: 'todoist_create_section',
    tier: 'write',
    description: 'Create a section in a project.',
    schema: { name: z.string(), project_id: z.string(), order: z.number().optional() },
    handler: (args) => createSection(args),
    shapeData: (d, slim) => shapeOne(d, slimSection, slim),
  },
  {
    name: 'todoist_create_sections_batch',
    tier: 'write',
    description: 'Create many sections in one call.',
    schema: {
      sections: z.array(z.object({ name: z.string(), project_id: z.string(), order: z.number().optional() })),
    },
    handler: ({ sections }: any) => createSectionsBatch(sections),
    shapeData: (d, slim) => (slim && d?.created ? { ...d, created: d.created.map(slimSection) } : d),
  },
  {
    name: 'todoist_update_section',
    tier: 'write',
    description: 'Rename a section.',
    schema: { section_id: z.string(), name: z.string() },
    handler: ({ section_id, name }: any) => updateSection(section_id, name),
    shapeData: (d, slim) => shapeOne(d, slimSection, slim),
  },
  {
    name: 'todoist_delete_section',
    tier: 'destructive',
    description: 'Permanently delete a section and its tasks (unrecoverable).',
    schema: { section_id: z.string() },
    handler: ({ section_id }: any) => deleteSection(section_id),
  },

  // ── Comments ─────────────────────────────────────────────────────────────────
  {
    name: 'todoist_list_comments',
    tier: 'read',
    description: 'List comments for a task or project (one of the two IDs required). Authoritative comment state.',
    schema: { task_id: z.string().optional(), project_id: z.string().optional() },
    handler: (args) => listComments(args),
    shapeData: (d, slim) => shapeList(d, slimComment, slim),
  },
  {
    name: 'todoist_get_comment',
    tier: 'read',
    description: 'Get one comment by ID.',
    schema: { comment_id: z.string() },
    handler: ({ comment_id }: any) => getComment(comment_id),
    shapeData: (d, slim) => shapeOne(d, slimComment, slim),
  },
  {
    name: 'todoist_create_comment',
    tier: 'write',
    description: 'Create a comment on a task or project, with an optional prefix tag.',
    schema: {
      content: z.string(),
      task_id: z.string().optional(),
      project_id: z.string().optional(),
      prefix: PREFIX_ENUM.optional(),
      attachment: z.object({ file_url: z.string(), file_type: z.string(), file_name: z.string() }).optional(),
    },
    handler: (args) => createComment(args),
    shapeData: (d, slim) => shapeOne(d, slimComment, slim),
  },
  {
    name: 'todoist_create_comments_batch',
    tier: 'write',
    description: 'Create many comments in one call.',
    schema: {
      comments: z.array(z.object({
        content: z.string(),
        task_id: z.string().optional(),
        project_id: z.string().optional(),
        prefix: PREFIX_ENUM.optional(),
      })),
    },
    handler: ({ comments }: any) => createCommentsBatch(comments),
    shapeData: (d, slim) => (slim && d?.created ? { ...d, created: d.created.map(slimComment) } : d),
  },
  {
    name: 'todoist_update_comment',
    tier: 'write',
    description: 'Replace a comment\'s content.',
    schema: { comment_id: z.string(), content: z.string(), prefix: PREFIX_ENUM.optional() },
    handler: ({ comment_id, ...params }: any) => updateComment(comment_id, params),
    shapeData: (d, slim) => shapeOne(d, slimComment, slim),
  },
  {
    name: 'todoist_delete_comment',
    tier: 'destructive',
    description: 'Delete a comment (agent-maintained surface; allowlisted in tier policy).',
    schema: { comment_id: z.string() },
    handler: ({ comment_id }: any) => deleteComment(comment_id),
  },
  {
    name: 'todoist_add_research_comment',
    tier: 'write',
    description: 'Add a [Research]-prefixed comment to a task.',
    schema: { task_id: z.string(), research: z.string() },
    handler: ({ task_id, research }: any) => addResearchComment(task_id, research),
    shapeData: (d, slim) => shapeOne(d, slimComment, slim),
  },
  {
    name: 'todoist_add_context_comment',
    tier: 'write',
    description: 'Add a [Context]-prefixed comment to a task.',
    schema: { task_id: z.string(), context: z.string() },
    handler: ({ task_id, context }: any) => addContextComment(task_id, context),
    shapeData: (d, slim) => shapeOne(d, slimComment, slim),
  },

  // ── Labels ───────────────────────────────────────────────────────────────────
  {
    name: 'todoist_list_labels',
    tier: 'read',
    description: 'List all personal labels.',
    schema: {},
    handler: () => listLabels(),
    shapeData: (d, slim) => shapeList(d, slimLabel, slim),
  },
  {
    name: 'todoist_get_label',
    tier: 'read',
    description: 'Get one label by ID.',
    schema: { label_id: z.string() },
    handler: ({ label_id }: any) => getLabel(label_id),
    shapeData: (d, slim) => shapeOne(d, slimLabel, slim),
  },
  {
    name: 'todoist_create_label',
    tier: 'write',
    description: 'Create a label.',
    schema: {
      name: z.string(),
      color: z.string().optional(),
      order: z.number().optional(),
      is_favorite: z.boolean().optional(),
    },
    handler: (args) => createLabel(args),
    shapeData: (d, slim) => shapeOne(d, slimLabel, slim),
  },
  {
    name: 'todoist_update_label',
    tier: 'write',
    description: 'Update a label.',
    schema: {
      label_id: z.string(),
      name: z.string().optional(),
      color: z.string().optional(),
      order: z.number().optional(),
      is_favorite: z.boolean().optional(),
    },
    handler: ({ label_id, ...params }: any) => updateLabel(label_id, params),
    shapeData: (d, slim) => shapeOne(d, slimLabel, slim),
  },
  {
    name: 'todoist_delete_label',
    tier: 'destructive',
    description: 'Delete a label (taxonomy maintenance; allowlisted in tier policy).',
    schema: { label_id: z.string() },
    handler: ({ label_id }: any) => deleteLabel(label_id),
  },

  // ── Completed + stats ────────────────────────────────────────────────────────
  {
    name: 'todoist_list_completed_tasks',
    tier: 'read',
    description: 'List completed tasks by completion date (defaults to the last 3 months; single page, cursor to continue).',
    schema: {
      project_id: z.string().optional(),
      section_id: z.string().optional(),
      limit: z.number().min(1).max(200).optional(),
      since: z.string().optional().describe('ISO datetime'),
      until: z.string().optional().describe('ISO datetime'),
      cursor: z.string().optional(),
    },
    handler: (args) => listCompletedTasks(args),
  },
  {
    name: 'todoist_get_completed_stats',
    tier: 'read',
    description: 'Completion counts by project and date over the last 3 months (pages up to 1000 completions).',
    schema: { project_id: z.string().optional() },
    handler: async ({ project_id }: any) => {
      // v1.0 undercounted: single 200-item page. Page up to 5 cursors here.
      const byProject: Record<string, number> = {};
      const byDate: Record<string, number> = {};
      let total = 0;
      let cursor: string | undefined;
      for (let page = 0; page < 5; page++) {
        const res = await listCompletedTasks({ project_id, limit: 200, cursor });
        if (!res.success || !res.data) {
          return page === 0 ? res : createResponse(true, { total, byProject, byDate, truncated: true });
        }
        for (const t of res.data.items) {
          total++;
          byProject[t.project_id] = (byProject[t.project_id] || 0) + 1;
          const date = t.completed_at.split('T')[0];
          byDate[date] = (byDate[date] || 0) + 1;
        }
        cursor = res.data.next_cursor;
        if (!cursor) break;
      }
      return createResponse(true, { total, byProject, byDate, truncated: Boolean(cursor) });
    },
  },
  {
    name: 'todoist_get_productivity_stats',
    tier: 'read',
    description: 'Native Todoist productivity stats (karma, daily/weekly goals, streaks).',
    schema: {},
    handler: () => envelope(() => getProductivityStats()),
  },

  // ── Workspace / overview ─────────────────────────────────────────────────────
  {
    name: 'todoist_get_workspace_overview',
    tier: 'read',
    description: 'Projects + sections + ALL active tasks in one call. Pre-flight a count first: large accounts produce very large payloads even slimmed.',
    schema: { project_id: z.string().optional() },
    handler: (args) => getWorkspaceOverview(args),
    shapeData: (d, slim) => {
      if (!d) return d;
      const counts = {
        project_count: d.projects?.length ?? 0,
        section_count: d.sections?.length ?? 0,
        task_count: d.tasks?.length ?? 0,
      };
      if (!slim) return { ...counts, ...d };
      return {
        ...counts,
        projects: (d.projects ?? []).map(slimProject),
        sections: (d.sections ?? []).map(slimSection),
        tasks: (d.tasks ?? []).map(slimTask),
      };
    },
  },

  // ── Reminders (Pro) ──────────────────────────────────────────────────────────
  {
    name: 'todoist_list_reminders',
    tier: 'read',
    description: 'List reminders, optionally for one task (item_id).',
    schema: { item_id: z.string().optional() },
    handler: (args) => envelope(() => listReminders(args)),
    shapeData: (d, slim) => shapeList(d, slimReminder, slim),
  },
  {
    name: 'todoist_create_reminder',
    tier: 'write',
    description: 'Create a reminder on a task: relative (minute_offset before due) or absolute (due_string/due_date/due_datetime).',
    schema: {
      item_id: z.string(),
      type: z.enum(['relative', 'absolute']).optional(),
      minute_offset: z.number().optional(),
      due_string: z.string().optional(),
      due_date: z.string().optional(),
      due_datetime: z.string().optional(),
    },
    handler: ({ due_string, due_date, due_datetime, ...rest }: any) =>
      envelope(() => {
        const params: any = { ...rest };
        if (due_string || due_date || due_datetime) {
          params.due = {};
          if (due_string) params.due.string = due_string;
          if (due_date) params.due.date = due_date;
          if (due_datetime) params.due.datetime = due_datetime;
        }
        return createReminder(params);
      }),
    shapeData: (d, slim) => shapeOne(d, slimReminder, slim),
  },
  {
    name: 'todoist_update_reminder',
    tier: 'write',
    description: 'Update a reminder.',
    schema: {
      reminder_id: z.string(),
      minute_offset: z.number().optional(),
      due_string: z.string().optional(),
      due_date: z.string().optional(),
      due_datetime: z.string().optional(),
    },
    handler: ({ reminder_id, due_string, due_date, due_datetime, ...rest }: any) =>
      envelope(() => {
        const params: any = { ...rest };
        if (due_string || due_date || due_datetime) {
          params.due = {};
          if (due_string) params.due.string = due_string;
          if (due_date) params.due.date = due_date;
          if (due_datetime) params.due.datetime = due_datetime;
        }
        return updateReminder(reminder_id, params);
      }),
    shapeData: (d, slim) => shapeOne(d, slimReminder, slim),
  },
  {
    name: 'todoist_delete_reminder',
    tier: 'destructive',
    description: 'Delete a reminder.',
    schema: { reminder_id: z.string() },
    handler: ({ reminder_id }: any) => envelope(() => deleteReminder(reminder_id)),
  },

  // ── Saved filters (Pro) ──────────────────────────────────────────────────────
  {
    name: 'todoist_list_filters',
    tier: 'read',
    description: 'List saved filters (name + query).',
    schema: {},
    handler: () => envelope(() => listFilters()),
    shapeData: (d, slim) => shapeList(d, slimFilter, slim),
  },
  {
    name: 'todoist_create_filter',
    tier: 'write',
    description: 'Create a saved filter.',
    schema: {
      name: z.string(),
      query: z.string(),
      color: z.string().optional(),
      is_favorite: z.boolean().optional(),
    },
    handler: (args) => envelope(() => createFilter(args)),
    shapeData: (d, slim) => shapeOne(d, slimFilter, slim),
  },
  {
    name: 'todoist_update_filter',
    tier: 'write',
    description: 'Update a saved filter.',
    schema: {
      filter_id: z.string(),
      name: z.string().optional(),
      query: z.string().optional(),
      color: z.string().optional(),
      is_favorite: z.boolean().optional(),
    },
    handler: ({ filter_id, ...params }: any) => envelope(() => updateFilter(filter_id, params)),
    shapeData: (d, slim) => shapeOne(d, slimFilter, slim),
  },
  {
    name: 'todoist_delete_filter',
    tier: 'destructive',
    description: 'Delete a saved filter.',
    schema: { filter_id: z.string() },
    handler: ({ filter_id }: any) => envelope(() => deleteFilter(filter_id)),
  },

  // ── Activity / backups / account ─────────────────────────────────────────────
  {
    name: 'todoist_get_activity',
    tier: 'read',
    description: 'Activity log (what changed, when): filter by object_type/object_id/event_type/project; single page, cursor to continue.',
    schema: {
      object_type: z.string().optional().describe('item | project | section | note | label | filter'),
      object_id: z.string().optional(),
      parent_project_id: z.string().optional(),
      event_type: z.string().optional().describe('added | updated | completed | deleted | archived …'),
      since: z.string().optional(),
      until: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
    },
    handler: (args) => envelope(() => getActivity(args)),
    shapeData: (d, slim) => {
      if (!slim || !d) return d;
      const events = d.results ?? d.events ?? [];
      return { ...d, results: events.map(slimActivityEvent), events: undefined };
    },
  },
  {
    name: 'todoist_list_backups',
    tier: 'read',
    description: 'List available account backups (version + download URL; downloads are the owner\'s, in-browser).',
    schema: {},
    handler: () => envelope(() => listBackups()),
  },
  {
    name: 'todoist_get_user',
    tier: 'read',
    description: 'Account info: plan status, timezone, karma, goals.',
    schema: {},
    handler: () => envelope(() => getUser()),
  },
];

// ── Server bootstrap ─────────────────────────────────────────────────────────
const cfg = loadConfig();
const server = new McpServer({ name: 'todoist-mcp', version: '2.0.0' });
const report = registerAll(server, defs, cfg);

// Capabilities audit — always registered, reports the exact live surface.
server.tool(
  'todoist_get_capabilities',
  'Report this server\'s active tool surface: mode, slim flag, registered tools with tiers, and tools filtered out by config.',
  {},
  async () => ({
    content: [{ type: 'text' as const, text: JSON.stringify(createResponse(true, report)) }],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `todoist-mcp v2 on stdio — mode=${cfg.mode} slim=${cfg.slim} ` +
    `tools=${report.registered.length} filtered=${report.filtered.length}`
  );
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
