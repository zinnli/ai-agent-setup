import path from 'node:path';
import type { CoreModel, Diagnostic } from './model.js';
import { classifyMcpEnv } from '../adapters/shared/mcp-env.js';

/**
 * Whole-model validation: schema completeness + cross-references. Loaders stay
 * dumb; this is the single place that sees every category at once (so it can
 * check agent->skill and skill->skill references).
 */
export function validateCore(core: CoreModel): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const skillNames = new Set(core.skills.map((s) => s.name));

  // --- Agents ---
  const seenAgents = new Set<string>();
  for (const a of core.agents) {
    if (!a.name) req(diags, a.sourceFile, 'agents', 'agent is missing "name".');
    if (!a.description) req(diags, a.sourceFile, 'agents', `agent "${a.name}" is missing "description".`);
    if (!a.mode) req(diags, a.sourceFile, 'agents', `agent "${a.name}" is missing "mode".`);
    if (seenAgents.has(a.name)) {
      diags.push({ level: 'error', category: 'agents', message: `duplicate agent name "${a.name}".`, sourceFile: a.sourceFile });
    }
    seenAgents.add(a.name);
    for (const skill of a.skills) {
      if (!skillNames.has(skill)) {
        diags.push({ level: 'error', category: 'agents', message: `agent "${a.name}" references unknown skill "${skill}".`, sourceFile: a.sourceFile });
      }
    }
  }

  // --- Skills ---
  const seenSkills = new Set<string>();
  for (const s of core.skills) {
    const folder = path.basename(s.dir);
    if (!s.name) req(diags, s.dir, 'skills', 'skill is missing "name".');
    else if (s.name !== folder) {
      diags.push({ level: 'error', category: 'skills', message: `skill name "${s.name}" does not match folder "${folder}".`, sourceFile: s.dir });
    }
    if (!s.description) req(diags, s.dir, 'skills', `skill "${s.name}" is missing "description".`);
    if (s.whenToUse.length === 0) {
      diags.push({ level: 'warn', category: 'skills', message: `skill "${s.name}" has empty when_to_use.`, sourceFile: s.dir });
    }
    if (!s.body) req(diags, s.dir, 'skills', `skill "${s.name}" has empty body.md.`);
    if (seenSkills.has(s.name)) {
      diags.push({ level: 'error', category: 'skills', message: `duplicate skill name "${s.name}".`, sourceFile: s.dir });
    }
    seenSkills.add(s.name);
    for (const rel of s.related) {
      if (!skillNames.has(rel)) {
        diags.push({ level: 'warn', category: 'skills', message: `skill "${s.name}" relates to unknown skill "${rel}".`, sourceFile: s.dir });
      }
    }
  }

  // --- MCP ---
  for (const m of core.mcpServers) {
    if (m.transport === 'stdio' && !m.command) {
      req(diags, m.sourceFile, 'mcp', `mcp server "${m.name}" is stdio but has no command.`);
    }
    if ((m.transport === 'sse' || m.transport === 'http') && !m.url) {
      req(diags, m.sourceFile, 'mcp', `mcp server "${m.name}" is ${m.transport} but has no url.`);
    }
    const env = classifyMcpEnv(m.env);
    for (const { key, value } of env.malformed) {
      diags.push({ level: 'error', category: 'mcp', message: `mcp server "${m.name}" env "${key}" = "${value}" is a malformed \${VAR} reference (use exactly \${UPPER_SNAKE}); it must not be stored as a literal.`, sourceFile: m.sourceFile });
    }
    for (const { key, ref } of env.renamed) {
      diags.push({ level: 'warn', category: 'mcp', message: `mcp server "${m.name}" env "${key}" references a differently-named var \${${ref}} — Codex env_vars cannot rename; use \${${key}} or record it in COMPATIBILITY.`, sourceFile: m.sourceFile });
    }
    for (const key of Object.keys(env.literal)) {
      diags.push({ level: 'warn', category: 'mcp', message: `mcp server "${m.name}" env "${key}" is a literal value (not a \${VAR} reference) — possible literal secret.`, sourceFile: m.sourceFile });
    }
  }

  return diags;
}

function req(diags: Diagnostic[], sourceFile: string, category: string, message: string): void {
  diags.push({ level: 'error', category, message, sourceFile });
}
