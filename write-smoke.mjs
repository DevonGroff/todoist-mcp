#!/usr/bin/env node
/**
 * Live write-path smoke (owner-approved 2026-07-05): quick_add → update (deadline_date)
 * → get_task → complete_task, on ONE clearly-marked test task. Leaves nothing active.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let pass = 0, fail = 0;
const t = (desc, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS: ${desc}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL: ${desc}${extra ? ' — ' + extra : ''}`); }
};

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
  env: { ...process.env },
  stderr: 'ignore',
});
const client = new Client({ name: 'write-smoke', version: '1.0.0' });
await client.connect(transport);

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content?.[0]?.text ?? '{}');
}

try {
  const created = await call('todoist_quick_add', { text: 'AGENT V2 SMOKE TEST task today p3' });
  t('quick_add creates from natural language', created.success && created.data?.id,
    `id=${created.data?.id} due=${created.data?.due?.date}`);
  const id = created.data.id;

  const updated = await call('todoist_update_task', {
    task_id: id,
    content: 'AGENT V2 SMOKE TEST (updated)',
    deadline_date: '2026-07-10',
  });
  t('update_task accepts deadline_date', updated.success,
    `deadline=${JSON.stringify(updated.data?.deadline)}`);

  const fetched = await call('todoist_get_task', { task_id: id });
  t('get_task roundtrip: content + deadline + comment_count',
    fetched.success && fetched.data?.content === 'AGENT V2 SMOKE TEST (updated)'
    && fetched.data?.deadline && fetched.data?.comment_count === 0,
    `deadline=${JSON.stringify(fetched.data?.deadline)} comment_count=${fetched.data?.comment_count}`);

  const completed = await call('todoist_complete_task', { task_id: id });
  t('complete_task', completed.success && completed.data?.completed === true);
} finally {
  await client.close();
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
