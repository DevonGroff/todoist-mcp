/**
 * Server-side permission + shaping config — the single place deployment behavior is set.
 *
 * Every tool declares a tier; registration is filtered here BEFORE the MCP client ever
 * sees the tool. Non-registration is the strongest deny: it holds even on harness
 * channels that skip client-side permission prompts.
 *
 *   read        — pure reads, never mutate
 *   write       — creates/updates/completes (recoverable in-app)
 *   destructive — deletes and reopens (unrecoverable or state-rewinding)
 *
 * Env knobs:
 *   TODOIST_TOOL_MODE   full | standard | read-only     (default: standard)
 *                       standard = read + write; destructive tools are NOT registered.
 *   TODOIST_TOOLS_DENY  comma-separated exact tool names to force OFF (after mode)
 *   TODOIST_TOOLS_ALLOW comma-separated exact tool names to force ON  (after mode;
 *                       deny wins over allow if both name the same tool)
 *   TODOIST_SLIM        1 (default) = trimmed payloads | 0 = raw API objects
 *
 * The active surface is auditable at runtime via the `todoist_get_capabilities` tool,
 * which reports mode, every registered tool with its tier, and what was filtered out.
 */

export type ToolTier = 'read' | 'write' | 'destructive';

export type ToolMode = 'full' | 'standard' | 'read-only';

const VALID_MODES: ToolMode[] = ['full', 'standard', 'read-only'];

function parseList(v: string | undefined): Set<string> {
  return new Set(
    (v ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
}

export interface ServerConfig {
  mode: ToolMode;
  deny: Set<string>;
  allow: Set<string>;
  slim: boolean;
}

export function loadConfig(): ServerConfig {
  const rawMode = (process.env.TODOIST_TOOL_MODE ?? 'standard').toLowerCase() as ToolMode;
  const mode = VALID_MODES.includes(rawMode) ? rawMode : 'standard';
  return {
    mode,
    deny: parseList(process.env.TODOIST_TOOLS_DENY),
    allow: parseList(process.env.TODOIST_TOOLS_ALLOW),
    slim: process.env.TODOIST_SLIM !== '0',
  };
}

const TIER_BY_MODE: Record<ToolMode, ToolTier[]> = {
  'read-only': ['read'],
  standard: ['read', 'write'],
  full: ['read', 'write', 'destructive'],
};

/** Decide whether a tool is registered under the current config, with a reason for the audit tool. */
export function toolEnabled(
  name: string,
  tier: ToolTier,
  cfg: ServerConfig
): { enabled: boolean; reason: string } {
  if (cfg.deny.has(name)) return { enabled: false, reason: 'TODOIST_TOOLS_DENY' };
  if (cfg.allow.has(name)) return { enabled: true, reason: 'TODOIST_TOOLS_ALLOW' };
  const enabled = TIER_BY_MODE[cfg.mode].includes(tier);
  return { enabled, reason: `mode=${cfg.mode} tier=${tier}` };
}
