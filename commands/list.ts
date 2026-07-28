import path from 'node:path';
import type { CoreModel } from '../loader/model.js';
import type { Adapter, UnsupportedItem } from '../adapters/types.js';
import { loadCore } from '../loader/load.js';
import { selectAdapters } from '../adapters/registry.js';
import { coreDir as defaultCoreDir } from '../util/paths.js';
import { createLogger, type Logger } from '../util/log.js';

export interface ListOptions {
  target: string;
  coreDir?: string;
  json?: boolean;
  verbose?: boolean;
  logger?: Logger;
}

export type Category = 'instructions' | 'agents' | 'skills' | 'hooks' | 'mcp';
export type Support = 'yes' | 'partial';

export interface ListItem {
  category: Category;
  name: string;
  enabled: boolean;
  source: string;
  /** per-adapter support + destination (only adapters in scope appear) */
  adapters: Record<string, { support: Support; dest: string; warnings: string[] }>;
}

export interface ListReport {
  target: string;
  items: ListItem[];
}

/** Enumerate every core item with per-adapter support, destination, and warnings. */
export function computeList(opts: ListOptions): ListReport {
  const dir = opts.coreDir ?? defaultCoreDir();
  const { core } = loadCore(dir);
  const adapters = selectAdapters(opts.target);

  // Per-adapter compatibility notes, grouped by category.
  const notesByAdapter = new Map<string, Map<string, string[]>>();
  for (const a of adapters) {
    const byCat = new Map<string, string[]>();
    for (const u of a.render(core).unsupported as UnsupportedItem[]) {
      const key = u.field ? `${u.category}.${u.field}` : u.category;
      const list = byCat.get(u.category) ?? [];
      list.push(`${key}: ${u.reason}`);
      byCat.set(u.category, list);
    }
    notesByAdapter.set(a.id, byCat);
  }

  const perAdapter = (category: Category, name: string): ListItem['adapters'] => {
    const out: ListItem['adapters'] = {};
    for (const a of adapters) {
      const warnings = notesByAdapter.get(a.id)?.get(category) ?? [];
      out[a.id] = {
        support: warnings.length > 0 ? 'partial' : 'yes',
        dest: destFor(a, category, name),
        warnings,
      };
    }
    return out;
  };

  const items: ListItem[] = [];
  for (const i of [...core.instructions].sort((a, b) => a.order - b.order)) {
    items.push({ category: 'instructions', name: i.id, enabled: true, source: rel(dir, i.sourceFile), adapters: perAdapter('instructions', i.id) });
  }
  for (const a of core.agents) {
    items.push({ category: 'agents', name: a.name, enabled: true, source: rel(dir, a.sourceFile), adapters: perAdapter('agents', a.name) });
  }
  for (const s of core.skills) {
    items.push({ category: 'skills', name: s.name, enabled: true, source: rel(dir, s.dir), adapters: perAdapter('skills', s.name) });
  }
  for (const h of core.hooks) {
    items.push({ category: 'hooks', name: h.id, enabled: true, source: rel(dir, h.scriptFile), adapters: perAdapter('hooks', h.id) });
  }
  for (const m of core.mcpServers) {
    items.push({ category: 'mcp', name: m.name, enabled: m.enabled, source: rel(dir, m.sourceFile), adapters: perAdapter('mcp', m.name) });
  }

  return { target: opts.target, items };
}

/** Best-effort display path (rooted at ~) for where an item installs per tool. */
function destFor(adapter: Adapter, category: Category, name: string): string {
  const root = adapter.installRoot('~');
  const skills = adapter.skillsRoot('~');
  switch (category) {
    case 'instructions':
      return path.join(root, adapter.id === 'codex' ? 'AGENTS.md' : 'CLAUDE.md');
    case 'agents':
      return path.join(root, 'agents', `${name}.${adapter.id === 'codex' ? 'toml' : 'md'}`);
    case 'skills':
      return path.join(skills, name, 'SKILL.md');
    case 'hooks':
      return path.join(root, 'hooks', `${name}.wrapper.sh`);
    case 'mcp':
      return adapter.id === 'codex' ? path.join(root, 'config.toml') : '~/.claude.json';
  }
}

function rel(coreDir: string, abs: string): string {
  const base = path.dirname(coreDir); // repo root
  const r = path.relative(base, abs);
  return r.startsWith('..') ? abs : r;
}

export function formatListText(r: ListReport): string {
  const lines: string[] = [`target: ${r.target}`];
  let cat = '';
  for (const it of r.items) {
    if (it.category !== cat) {
      cat = it.category;
      lines.push('', `${cat}:`);
    }
    const enabled = it.enabled ? '' : ' (disabled)';
    const support = Object.entries(it.adapters)
      .map(([id, a]) => `${id}=${a.support}`)
      .join(' ');
    lines.push(`  ${it.name}${enabled}  [${support}]  ${it.source}`);
    for (const [id, a] of Object.entries(it.adapters)) {
      for (const w of a.warnings) lines.push(`      ⚠ ${id}: ${w}`);
    }
  }
  return lines.join('\n');
}

export function runList(opts: ListOptions): ListReport {
  const log = opts.logger ?? createLogger({ verbose: opts.verbose });
  const report = computeList(opts);
  if (opts.json) log.info(JSON.stringify(report, null, 2));
  else log.info(formatListText(report));
  return report;
}
