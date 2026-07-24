/**
 * Classify a core MCP server's `env` map into the distinct shapes different
 * tools need. Core stores `env` as `KEY: "${VAR}"` references (never literal
 * secrets), but tools consume them differently:
 *
 * - Codex stdio: a `${VAR}` reference whose var name equals the key is forwarded
 *   from the parent process via `env_vars = ["VAR"]`; a genuine literal goes into
 *   `env = { KEY = "value" }`. (Verified against codex-cli 0.142.5 + manual.)
 * - Claude: keeps the `${VAR}` string in env and expands it itself.
 *
 * A value is a *clean reference* only if it is exactly `${NAME}` with an
 * UPPER_SNAKE name. Anything else that still looks placeholder-ish (contains `$`)
 * is a *malformed* reference — it must never be written out as a literal, because
 * that would either leak a half-resolved secret or silently fail at runtime.
 */
export interface ClassifiedEnv {
  /** var names to forward from the parent env (reference name === key). */
  forward: string[];
  /** intentional literal values (no `$`), safe to write verbatim. */
  literal: Record<string, string>;
  /** reference to a differently-named var — no faithful `env_vars` mapping. */
  renamed: { key: string; ref: string }[];
  /** looks like a placeholder but is malformed (e.g. `$VAR`, `${v}`, `a-${V}`). */
  malformed: { key: string; value: string }[];
}

const CLEAN_REF = /^\$\{([A-Z0-9_]+)\}$/;
/** Any `$` usage that is not a clean full reference is treated as placeholder-ish. */
const LOOKS_PLACEHOLDER = /\$/;

export function classifyMcpEnv(env: Record<string, string>): ClassifiedEnv {
  const out: ClassifiedEnv = { forward: [], literal: {}, renamed: [], malformed: [] };
  for (const key of Object.keys(env).sort()) {
    const value = env[key]!;
    const m = CLEAN_REF.exec(value);
    if (m) {
      const ref = m[1]!;
      if (ref === key) out.forward.push(key);
      else out.renamed.push({ key, ref });
    } else if (LOOKS_PLACEHOLDER.test(value)) {
      out.malformed.push({ key, value });
    } else {
      out.literal[key] = value;
    }
  }
  return out;
}
