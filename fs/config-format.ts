import TOML from '@iarna/toml';
import type { Json } from '../util/objpath.js';

export type ConfigFormat = 'json' | 'toml';

/** Parse a config file's text into a plain object, format-aware. */
export function tryParseConfig(
  text: string,
  format: ConfigFormat,
): { ok: true; value: Json } | { ok: false; error: string } {
  try {
    const value = format === 'toml' ? (TOML.parse(text) as Json) : (JSON.parse(text) as Json);
    return { ok: true, value: value ?? {} };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Serialize an object back to config text, format-aware, with a trailing newline. */
export function stringifyConfig(value: Json, format: ConfigFormat): string {
  if (format === 'toml') {
    return TOML.stringify(value as TOML.JsonMap) + '';
  }
  return JSON.stringify(value, null, 2) + '\n';
}
