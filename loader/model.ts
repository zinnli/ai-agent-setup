/**
 * Normalized, tool-neutral in-memory model of everything under core/.
 *
 * Loaders (loader/load-*.ts) parse the raw YAML/Markdown/shell sources into
 * these shapes; adapters (adapters/**) consume them and never re-read core/.
 * Nothing here is Claude- or Codex-specific.
 */

export interface CoreModel {
  instructions: Instruction[];
  agents: Agent[];
  skills: Skill[];
  hooks: Hook[];
  mcpServers: McpServer[];
}

export interface Instruction {
  /** filename stem, e.g. "base" | "frontend" | "git" | "safety" */
  id: string;
  /** resolved precedence, lower = applied first / lower priority */
  order: number;
  /** raw markdown body */
  content: string;
  sourceFile: string;
}

export interface Agent {
  name: string;
  description: string;
  mode: string;
  /** skill names this agent references; cross-ref into Skill.name */
  skills: string[];
  instructions: string[];
  sourceFile: string;
}

export interface SkillResource {
  /** path relative to the skill dir, e.g. "resources/checklist.md" */
  relPath: string;
  content: string;
}

export interface Skill {
  /** must equal the skill folder name */
  name: string;
  description: string;
  whenToUse: string[];
  notFor: string[];
  inputs: string[];
  outputs: string[];
  /** other skill names; cross-ref into Skill.name */
  related: string[];
  /** optional — only some skills declare prerequisites (e.g. context7-docs) */
  requires?: string[];
  /** body.md contents */
  body: string;
  resources: SkillResource[];
  /** absolute path to the skill folder */
  dir: string;
}

export type HookTrigger =
  | 'before-command'
  | 'before-file-access'
  | 'after-file-change'
  | 'before-finish';

export type HookTarget = 'command' | 'read' | 'edit' | 'write';

export interface Hook {
  /** script stem, e.g. "protect-secrets" */
  id: string;
  /** absolute path to the neutral .sh script */
  scriptFile: string;
  trigger: HookTrigger;
  /** true = a non-zero exit blocks the action */
  blocking: boolean;
  targets: HookTarget[];
  /** default env for the hook, e.g. { HOOK_RUN_TESTS: "0" } */
  env?: Record<string, string>;
  description?: string;
}

export type McpTransport = 'stdio' | 'sse' | 'http';

export interface McpServer {
  name: string;
  enabled: boolean;
  transport: McpTransport;
  /** required when transport === "stdio" */
  command?: string;
  args: string[];
  /** env var name -> "${VAR}" reference (never a literal secret) */
  env: Record<string, string>;
  /** required when transport is sse/http */
  url?: string;
  sourceFile: string;
}

/** A validation finding produced by loader/validate.ts and adapters. */
export interface Diagnostic {
  level: 'error' | 'warn';
  category: string;
  message: string;
  sourceFile?: string;
}
