import type { CoreModel, Diagnostic } from '../core/model.js';

/** A single file an adapter wants written, described relative to an anchor root. */
export interface GeneratedFile {
  /** path relative to the chosen anchor root */
  relativePath: string;
  content: string;
  /** absolute core source paths that produced this file (manifest provenance) */
  sourceFiles: string[];
  /** octal file mode; e.g. 0o755 for executable hook scripts */
  mode?: number;
  /** true = ai-agent-setup fully owns/overwrites; false = structural merge target */
  managed: boolean;
  /**
   * Which root the relativePath is anchored to (default "install"):
   * - install: the tool's config dir (e.g. ~/.claude, ~/.codex)
   * - skills:  the tool's skills dir (e.g. ~/.claude/skills, ~/.agents/skills)
   * - home:    the HOME dir itself (e.g. user-global ~/.claude.json)
   */
  root?: 'install' | 'skills' | 'home';
  /**
   * For merge targets (managed:false): a human-readable display of the runtime
   * file this fragment merges into, e.g. "~/.claude.json". Provenance only.
   */
  mergeTarget?: string;
  /**
   * For merge targets: the object paths this fragment owns (dot notation), e.g.
   * ["mcpServers.notion"]. Phase 3 merges/removes exactly these paths.
   */
  managedPaths?: string[];
}

/** A core feature/field that has no faithful representation in a given tool. */
export interface UnsupportedItem {
  tool: string;
  category: string;
  field?: string;
  reason: string;
  coreSource: string;
}

export interface RenderResult {
  files: GeneratedFile[];
  unsupported: UnsupportedItem[];
}

export interface Adapter {
  id: 'claude' | 'codex';
  /** primary config dir for the tool, e.g. <home>/.claude or <home>/.codex */
  installRoot(home: string): string;
  /** where skill folders install, e.g. <root>/skills or <home>/.agents/skills */
  skillsRoot(home: string): string;
  /** tool-specific extra validation beyond core/validate.ts */
  validateCore(core: CoreModel): Diagnostic[];
  render(core: CoreModel): RenderResult;
}
