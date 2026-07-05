/**
 * Payload shapers — the efficiency layer. Todoist v1 objects carry 25+ fields; most are
 * single-user/workspace noise for an agent consumer. Slim mode (default, TODOIST_SLIM=1)
 * returns only decision-relevant fields. TODOIST_SLIM=0 restores raw passthrough.
 *
 * NOTE on note_count: the v1 task payload's note_count is UNRELIABLE (observed 0 on tasks
 * with comments). Slim mode therefore DROPS it from list responses rather than report a lie;
 * todoist_get_task returns an authoritative `comment_count` fetched from /comments.
 */

type Raw = Record<string, any>;

const pick = (obj: Raw, keys: string[]): Raw => {
  const out: Raw = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
};

export function slimTask(t: Raw): Raw {
  const out = pick(t, [
    'id', 'content', 'description', 'project_id', 'section_id', 'parent_id',
    'labels', 'priority', 'checked', 'child_order', 'added_at', 'updated_at',
    'completed_at', 'duration', 'deadline', 'responsible_uid',
  ]);
  if (t.due) {
    out.due = pick(t.due, ['date', 'datetime', 'string', 'is_recurring', 'timezone']);
  }
  // strip empty noise
  if (Array.isArray(out.labels) && out.labels.length === 0) delete out.labels;
  if (out.description === '') delete out.description;
  return out;
}

export function slimProject(p: Raw): Raw {
  return pick(p, [
    'id', 'name', 'description', 'parent_id', 'color', 'is_favorite',
    'is_archived', 'view_style', 'inbox_project', 'child_order',
  ]);
}

export function slimSection(s: Raw): Raw {
  return pick(s, ['id', 'project_id', 'name', 'section_order', 'is_archived']);
}

export function slimComment(c: Raw): Raw {
  return pick(c, ['id', 'item_id', 'project_id', 'posted_at', 'content', 'file_attachment']);
}

export function slimLabel(l: Raw): Raw {
  return pick(l, ['id', 'name', 'color', 'item_order', 'is_favorite']);
}

export function slimReminder(r: Raw): Raw {
  const out = pick(r, ['id', 'item_id', 'type', 'minute_offset', 'notify_uid']);
  if (r.due) out.due = pick(r.due, ['date', 'datetime', 'string', 'is_recurring', 'timezone']);
  return out;
}

export function slimFilter(f: Raw): Raw {
  return pick(f, ['id', 'name', 'query', 'color', 'item_order', 'is_favorite']);
}

export function slimActivityEvent(e: Raw): Raw {
  return pick(e, [
    'id', 'object_type', 'object_id', 'event_type', 'event_date',
    'parent_project_id', 'parent_item_id', 'extra_data',
  ]);
}

/** Apply a shaper across a list, honoring the slim flag. */
export function shapeList<T extends Raw>(items: T[], shaper: (x: Raw) => Raw, slim: boolean): Raw[] {
  return slim ? items.map(shaper) : items;
}

export function shapeOne<T extends Raw>(item: T, shaper: (x: Raw) => Raw, slim: boolean): Raw {
  return slim ? shaper(item) : item;
}
