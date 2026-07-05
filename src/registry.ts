/**
 * Tool registry — every tool is declared as data (name, tier, schema, handler) and
 * registration is a single filtered loop in index.ts. This replaces 45 inline
 * server.tool() blocks and makes the permission surface auditable:
 * `todoist_get_capabilities` reports exactly what is ON, what was filtered, and why.
 *
 * Handlers return the legacy ToolResponse envelope ({success, data|error}) so the
 * existing, battle-tested op functions plug in unchanged. `shapeData` (optional)
 * post-processes envelope.data for slim mode — shaping stays out of the op layer.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodRawShape } from 'zod';
import { ServerConfig, ToolTier, toolEnabled } from './config.js';
import { createResponse, handleApiError } from './utils/api-client.js';

export interface ToolDef {
  name: string;
  tier: ToolTier;
  description: string;
  schema: ZodRawShape;
  handler: (args: any) => Promise<any>;
  /** Optional slim-mode shaper applied to envelope.data on success. */
  shapeData?: (data: any, slim: boolean) => any;
}

/** Wrap a throw-style async fn into the ToolResponse envelope (for new tools). */
export async function envelope<T>(fn: () => Promise<T>): Promise<any> {
  try {
    return createResponse(true, await fn());
  } catch (err) {
    return createResponse(false, undefined, handleApiError(err));
  }
}

export interface RegistrationReport {
  mode: string;
  slim: boolean;
  registered: Array<{ name: string; tier: ToolTier }>;
  filtered: Array<{ name: string; tier: ToolTier; reason: string }>;
}

export function registerAll(
  server: McpServer,
  defs: ToolDef[],
  cfg: ServerConfig
): RegistrationReport {
  const report: RegistrationReport = {
    mode: cfg.mode,
    slim: cfg.slim,
    registered: [],
    filtered: [],
  };

  for (const def of defs) {
    const { enabled, reason } = toolEnabled(def.name, def.tier, cfg);
    if (!enabled) {
      report.filtered.push({ name: def.name, tier: def.tier, reason });
      continue;
    }
    report.registered.push({ name: def.name, tier: def.tier });
    server.tool(def.name, def.description, def.schema, async (args: any) => {
      let body: any;
      try {
        body = await def.handler(args);
        if (body?.success && def.shapeData) {
          body = { ...body, data: def.shapeData(body.data, cfg.slim) };
        }
      } catch (err) {
        body = createResponse(false, undefined, handleApiError(err));
      }
      // Compact JSON (no pretty-print): ~25% fewer tokens on list payloads than indent=2.
      return { content: [{ type: 'text' as const, text: JSON.stringify(body) }] };
    });
  }
  return report;
}
