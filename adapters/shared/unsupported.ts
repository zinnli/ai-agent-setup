import type { UnsupportedItem } from '../types.js';

/** Accumulates per-field/per-mapping compatibility gaps for a single tool. */
export class UnsupportedReport {
  private items: UnsupportedItem[] = [];
  constructor(private readonly tool: string) {}

  add(category: string, reason: string, coreSource: string, field?: string): void {
    const item: UnsupportedItem = { tool: this.tool, category, reason, coreSource };
    if (field) item.field = field;
    this.items.push(item);
  }

  all(): UnsupportedItem[] {
    return this.items;
  }
}

/** Render a COMPATIBILITY.md summarizing per-field gaps (never whole categories). */
export function renderCompatibility(tool: string, items: UnsupportedItem[]): string {
  const header = `# ${tool} compatibility\n\nItems below are individual fields or mappings from core/ that have no faithful\n${tool} representation. Everything not listed is fully supported.\n`;
  if (items.length === 0) {
    return header + '\nNo unsupported fields. Full parity.\n';
  }
  const rows = items
    .map((i) => `- **${i.category}${i.field ? '.' + i.field : ''}** — ${i.reason}  \n  source: \`${i.coreSource}\``)
    .join('\n');
  return header + '\n' + rows + '\n';
}
