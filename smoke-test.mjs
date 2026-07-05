#!/usr/bin/env node
/**
 * Protocol-level smoke test for todoist-mcp v2 — spawns the built server over stdio
 * exactly as Claude Code does, then exercises registration filtering + live reads.
 * Reads TODOIST_API_TOKEN from the task-agent .env internally (never printed).
 * Usage: node smoke-test.mjs [--env-file /path/to/.env]
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';

const ENV_FILE = process.argv.includes('--env-file')
  ? process.argv[process.argv.indexOf('--env-file') + 1]
  : '/Users/devon/claude-projects/task-agent/.env';

function loadToken() {
  if (process.env.TODOIST_API_TOKEN) return process.env.TODOIST_API_TOKEN;
  const text = readFileSync(ENV_FILE, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?TODOIST_API_TOKEN\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m) return m[1];
  }
  throw new Error(`TODOIST_API_TOKEN not found in env or ${ENV_FILE}`);
}

let pass = 0, fail = 0;
const t = (desc, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS: ${desc}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL: ${desc}${extra ? ' — ' + extra : ''}`); }
};

async function call(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '';
  return { body: JSON.parse(text), bytes: text.length };
}

async function run(mode, checks) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: { ...process.env, TODOIST_API_TOKEN: loadToken(), TODOIST_TOOL_MODE: mode },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  await client.connect(transport);
  try {
    await checks(client);
  } finally {
    await client.close();
  }
}

console.log('== standard mode (the deployment default) ==');
await run('standard', async (client) => {
  const { tools } = await client.listTools();
  const names = new Set(tools.map(x => x.name));
  t(`tool count ${tools.length}`, tools.length >= 45);
  t('destructives NOT registered', !names.has('todoist_delete_task') && !names.has('todoist_delete_project')
    && !names.has('todoist_delete_section') && !names.has('todoist_reopen_task') && !names.has('todoist_reopen_tasks_batch'));
  t('allowlisted-by-policy deletes present only if config allows',
    !names.has('todoist_delete_comment') && !names.has('todoist_delete_label'),
    'standard mode filters ALL destructive-tier incl. comment/label deletes');
  t('capabilities tool present', names.has('todoist_get_capabilities'));
  t('new v2 tools present', ['todoist_quick_add', 'todoist_list_reminders', 'todoist_list_filters',
    'todoist_get_activity', 'todoist_list_backups', 'todoist_get_user', 'todoist_get_productivity_stats']
    .every(n => names.has(n)));

  const caps = await call(client, 'todoist_get_capabilities');
  t('capabilities reports filtered destructives', caps.body.success
    && caps.body.data.filtered.some(f => f.name === 'todoist_delete_task'));

  const projects = await call(client, 'todoist_list_projects');
  t('list_projects live', projects.body.success && Array.isArray(projects.body.data) && projects.body.data.length >= 4,
    `${projects.body.data?.length} projects, ${projects.bytes}B slim`);
  const p0 = projects.body.data?.[0] ?? {};
  t('project payload is slim', !('public_key' in p0) && !('creator_uid' in p0) && !('access' in p0));

  const tasks = await call(client, 'todoist_list_tasks', { filter: 'today | overdue' });
  t('list_tasks filter canary live', tasks.body.success && Array.isArray(tasks.body.data),
    `${tasks.body.data?.length} tasks, ${tasks.bytes}B slim`);
  const t0 = tasks.body.data?.[0] ?? {};
  t('task payload is slim', !('added_by_uid' in t0) && !('day_order' in t0) && !('note_count' in t0));

  const task = await call(client, 'todoist_get_task', { task_id: '6h237H77wf8G6f3P' });
  t('get_task comment_count authoritative', task.body.success && task.body.data.comment_count === 2,
    `comment_count=${task.body.data?.comment_count} (list payload lies with 0)`);

  const filters = await call(client, 'todoist_list_filters');
  t('list_filters (Pro) live', filters.body.success && Array.isArray(filters.body.data),
    `${filters.body.data?.length} saved filters`);

  const reminders = await call(client, 'todoist_list_reminders');
  t('list_reminders (Pro) live', reminders.body.success && Array.isArray(reminders.body.data),
    `${reminders.body.data?.length} reminders`);

  const user = await call(client, 'todoist_get_user');
  t('get_user live + premium', user.body.success && Boolean(user.body.data.is_premium || user.body.data.premium_status),
    `plan=${user.body.data?.premium_status ?? 'is_premium:' + user.body.data?.is_premium}`);

  const activity = await call(client, 'todoist_get_activity', { limit: 5 });
  t('activity log live', activity.body.success, `${activity.bytes}B`);

  const backups = await call(client, 'todoist_list_backups');
  t('backups list live', backups.body.success && Array.isArray(backups.body.data),
    `${backups.body.data?.length} backups`);

  const stats = await call(client, 'todoist_get_productivity_stats');
  t('productivity stats live', stats.body.success);

  const search = await call(client, 'todoist_search_tasks', { query: 'tailnet', project_id: '6fx8GPQ22hcrGGHr' });
  t('search_tasks honors project_id (v1 bug fixed)', search.body.success
    && search.body.data.every(x => x.project_id === '6fx8GPQ22hcrGGHr'),
    `${search.body.data?.length} hits`);

  const overview = await call(client, 'todoist_get_workspace_overview');
  t('workspace_overview slim + counts', overview.body.success && typeof overview.body.data.task_count === 'number',
    `${overview.body.data?.task_count} tasks, ${overview.bytes}B total`);
});

console.log('== read-only mode ==');
await run('read-only', async (client) => {
  const { tools } = await client.listTools();
  const names = new Set(tools.map(x => x.name));
  t('no write tools', !names.has('todoist_create_task') && !names.has('todoist_complete_task') && !names.has('todoist_update_task'));
  t('reads still present', names.has('todoist_list_tasks') && names.has('todoist_get_task'));
});

console.log('== full mode + explicit deny ==');
process.env.TODOIST_TOOLS_DENY = 'todoist_delete_project';
await run('full', async (client) => {
  const { tools } = await client.listTools();
  const names = new Set(tools.map(x => x.name));
  t('full mode registers destructives', names.has('todoist_delete_task') && names.has('todoist_reopen_task'));
  t('explicit deny beats mode', !names.has('todoist_delete_project'));
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
