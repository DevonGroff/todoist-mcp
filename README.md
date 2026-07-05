# Todoist MCP Server (v2)

A Model Context Protocol (MCP) server for the **unified Todoist API v1**, built for AI-agent
consumption: a declarative tool registry with a server-side permission model, slim
token-efficient payloads, and coverage of the Pro surfaces (reminders, saved filters,
activity log, backups, productivity stats, natural-language quick-add).

## v2 highlights (2026-07-05 rebuild)

- **Permission model at the registration layer.** Every tool carries a tier
  (`read` / `write` / `destructive`); tools outside the configured mode are **never
  registered**, which holds even on harness channels that skip client-side permission
  prompts. `todoist_get_capabilities` audits the live surface (registered + filtered + why).
- **Slim payloads by default.** Todoist objects carry 25+ fields; slim mode returns only
  decision-relevant ones and uses compact JSON. Example: 4 projects = ~770B vs ~6KB raw
  pretty-printed. `TODOIST_SLIM=0` restores raw passthrough.
- **Reliable comment counts.** The v1 list-payload `note_count` is unreliable (reports 0 on
  tasks with comments); slim list payloads drop it, and `todoist_get_task` returns an
  authoritative `comment_count` fetched from `/comments`.
- **Fixed v1.x defects.** `todoist_search_tasks` now honors `project_id`/`section_id`/`label`
  (previously accepted-and-ignored); `todoist_get_completed_stats` pages up to 1000
  completions (previously silently capped at 200).
- **New v1 surfaces.** Reminders, saved filters (Sync-API lane — filters have no REST
  resource, verified live), activity log (`/activities`), backups, user/plan info,
  productivity stats (`/tasks/completed/stats`), `todoist_quick_add` (natural language),
  and `deadline_date` on task create/update (the do-date vs drop-dead-date distinction).

## Configuration

```json
{
  "mcpServers": {
    "todoist": {
      "command": "node",
      "args": ["/path/to/todoist-mcp/dist/index.js"],
      "env": { "TODOIST_API_TOKEN": "${TODOIST_API_TOKEN}" }
    }
  }
}
```

Environment knobs (all optional):

| Var | Values | Default | Effect |
|---|---|---|---|
| `TODOIST_TOOL_MODE` | `full` \| `standard` \| `read-only` | `standard` | `standard` registers read + write; **destructive tools (deletes, reopens) are not registered at all**. `read-only` registers only reads. |
| `TODOIST_TOOLS_DENY` | comma list of tool names | — | Force specific tools OFF (wins over everything). |
| `TODOIST_TOOLS_ALLOW` | comma list of tool names | — | Force specific tools ON regardless of mode (deny still wins). |
| `TODOIST_SLIM` | `1` \| `0` | `1` | Slim vs raw payloads. |

**Never commit your API token.**

## Tool surface

51 tools registered in `standard` mode; 9 more (`delete_*`, `reopen_*`) in `full`.
Ask the server itself: call `todoist_get_capabilities` for the live list with tiers.

Groups: tasks (list/get/search/hierarchy/duplicates · create/update/quick-add/complete/move/
follow-up/with-context · 4 batch ops · deletes+reopens destructive-tier), projects, sections,
comments (incl. `[Research]`/`[Context]` helpers), labels, completed+stats, workspace overview,
reminders, saved filters, activity log, backups, user.

Priority convention: API values are inverted from the UI (P1 urgent = 4 … P4 untriaged = 1).

## Response format

Every tool returns `{ success, data }` or `{ success: false, error: { code, message, details? } }`
as a single compact-JSON text block.

## Development & testing

```bash
npm run build        # tsc
npm run typecheck
node smoke-test.mjs  # protocol-level live smoke: spawns dist/index.js over stdio,
                     # verifies mode filtering + live reads (needs TODOIST_API_TOKEN)
```

## License

ISC
