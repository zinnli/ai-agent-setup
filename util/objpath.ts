/**
 * Minimal dot-path helpers for structural JSON merges. Path segments are split
 * on ".", so they assume key names without literal dots (true for our managed
 * paths like "mcpServers.notion" and "hooks.PreToolUse").
 */
export type Json = Record<string, unknown>;

export function getPath(obj: Json, dotted: string): unknown {
  let cur: unknown = obj;
  for (const key of dotted.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[key];
  }
  return cur;
}

export function setPath(obj: Json, dotted: string, value: unknown): void {
  const keys = dotted.split('.');
  let cur: Json = obj;
  for (const key of keys.slice(0, -1)) {
    if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key] as Json;
  }
  cur[keys[keys.length - 1]!] = value;
}

/** Delete a dot-path and prune any parent objects left empty. Returns true if removed. */
export function deletePath(obj: Json, dotted: string): boolean {
  const keys = dotted.split('.');
  const stack: Json[] = [obj];
  let cur: Json = obj;
  for (const key of keys.slice(0, -1)) {
    const next = cur[key];
    if (next == null || typeof next !== 'object') return false;
    cur = next as Json;
    stack.push(cur);
  }
  const last = keys[keys.length - 1]!;
  if (!(last in cur)) return false;
  delete cur[last];

  // prune empty parents (deepest first), but never delete the root object
  for (let i = stack.length - 1; i > 0; i--) {
    const node = stack[i]!;
    const parent = stack[i - 1]!;
    const parentKey = keys[i - 1]!;
    if (isEmptyObject(node)) delete parent[parentKey];
    else break;
  }
  return true;
}

export function isEmptyObject(v: unknown): boolean {
  return v != null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;
}
