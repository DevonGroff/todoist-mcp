/**
 * v2 additions: reminders, saved filters, activity log, backups, user/account,
 * natural-language quick-add. All Pro-plan surfaces of the unified v1 API that the
 * v1.0 server never exposed. Throw-style ops; the registry wraps them in envelopes.
 */
import { getApiClient } from '../utils/api-client.js';

type Raw = Record<string, any>;

// --- Reminders (Pro) -----------------------------------------------------------------------------

export async function listReminders(params: { item_id?: string } = {}): Promise<Raw[]> {
  const client = getApiClient();
  const all = await client.getAllPaginated<Raw>('/reminders', {});
  return params.item_id ? all.filter(r => r.item_id === params.item_id) : all;
}

export async function createReminder(params: Raw): Promise<Raw> {
  const client = getApiClient();
  return client.post<Raw>('/reminders', params);
}

export async function updateReminder(id: string, params: Raw): Promise<Raw> {
  const client = getApiClient();
  return client.post<Raw>(`/reminders/${id}`, params);
}

export async function deleteReminder(id: string): Promise<Raw> {
  const client = getApiClient();
  await client.delete(`/reminders/${id}`);
  return { deleted: true };
}

// --- Saved filters (Pro) -------------------------------------------------------------------------
// Filters have NO REST resource in v1 (GET /filters → 404, verified 2026-07-05); they are a
// Sync-API resource. Reads use a full-sync scoped to filters; writes use sync commands.

function syncStatusOk(res: { sync_status: Record<string, unknown> }): void {
  const status = Object.values(res.sync_status)[0];
  if (status !== 'ok') throw new Error(`sync command failed: ${JSON.stringify(status)}`);
}

export async function listFilters(): Promise<Raw[]> {
  const client = getApiClient();
  const res = await client.post<Raw>('/sync', { sync_token: '*', resource_types: ['filters'] });
  return res.filters ?? [];
}

export async function createFilter(params: Raw): Promise<Raw> {
  const client = getApiClient();
  const temp_id = `filter-${Math.random().toString(36).slice(2)}`;
  const res = await client.syncCommands([{ type: 'filter_add', temp_id, args: params }]);
  syncStatusOk(res);
  return { id: res.temp_id_mapping[temp_id], ...params };
}

export async function updateFilter(id: string, params: Raw): Promise<Raw> {
  const client = getApiClient();
  const res = await client.syncCommands([{ type: 'filter_update', args: { id, ...params } }]);
  syncStatusOk(res);
  return { id, ...params, updated: true };
}

export async function deleteFilter(id: string): Promise<Raw> {
  const client = getApiClient();
  const res = await client.syncCommands([{ type: 'filter_delete', args: { id } }]);
  syncStatusOk(res);
  return { deleted: true };
}

// --- Activity log --------------------------------------------------------------------------------

export async function getActivity(params: Raw = {}): Promise<Raw> {
  const client = getApiClient();
  // Single page by design (activity can be huge); caller pages with cursor.
  // Live path is /activities (the docs' "activity logs" naming 404s — verified 2026-07-05).
  const query: Raw = { limit: params.limit ?? 50 };
  for (const k of ['object_type', 'object_id', 'parent_project_id', 'event_type', 'cursor', 'since', 'until']) {
    if (params[k] !== undefined) query[k] = params[k];
  }
  return client.get<Raw>('/activities', query);
}

// --- Backups -------------------------------------------------------------------------------------

export async function listBackups(): Promise<Raw[]> {
  const client = getApiClient();
  const res = await client.get<Raw>('/backups');
  return Array.isArray(res) ? res : (res.results ?? res.backups ?? []);
}

// --- User / account ------------------------------------------------------------------------------

const USER_FIELDS = [
  'id', 'email', 'full_name', 'premium_status', 'premium_until', 'is_premium',
  'tz_info', 'lang', 'start_day', 'next_week', 'karma', 'karma_trend',
  'completed_count', 'completed_today', 'daily_goal', 'weekly_goal',
];

export async function getUser(): Promise<Raw> {
  const client = getApiClient();
  const user = await client.get<Raw>('/user');
  const out: Raw = {};
  for (const k of USER_FIELDS) if (user[k] !== undefined && user[k] !== null) out[k] = user[k];
  return out;
}

export async function getProductivityStats(): Promise<Raw> {
  const client = getApiClient();
  // Live path is /tasks/completed/stats (the docs' /user/productivity_stats 404s — verified 2026-07-05).
  return client.get<Raw>('/tasks/completed/stats');
}

// --- Natural-language quick add ------------------------------------------------------------------

export async function quickAddTask(params: { text: string; note?: string; reminder?: string; auto_reminder?: boolean }): Promise<Raw> {
  const client = getApiClient();
  const body: Raw = { text: params.text };
  if (params.note) body.note = params.note;
  if (params.reminder) body.reminder = params.reminder;
  if (params.auto_reminder !== undefined) body.auto_reminder = params.auto_reminder;
  return client.post<Raw>('/tasks/quick_add', body);
}

// --- Authoritative comment count (note_count in list payloads is unreliable) ----------------------

export async function countComments(taskId: string): Promise<number> {
  const client = getApiClient();
  const comments = await client.getAllPaginated<Raw>('/comments', { task_id: taskId });
  return comments.length;
}
