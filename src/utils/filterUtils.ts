// Compatibility shim for advanced filter utilities removed in dataflow refactor
// Provides minimal API used by editor-ext/filterTasks.ts and utils/RewardManager.ts

export type FilterNode = any;

// Very minimal parser: returns the raw string; real implementation lives elsewhere in the codebase.
// This keeps build passing without changing editor-ext consumers. You can replace later with full parser.
export function parseAdvancedFilterQuery(query: string): FilterNode {
  return query;
}

// Very permissive evaluator: if query is empty -> true; otherwise do a simple substring match on content/tags/project/context when possible.
// This is a temporary shim to satisfy type-check; views already have rich filtering via TaskFilterUtils.
export function evaluateFilterNode(node: FilterNode, task: any): boolean {
  if (!node || (typeof node === 'string' && node.trim() === '')) return true;
  const q = typeof node === 'string' ? node.toLowerCase() : '';
  if (!q) return true;
  try {
    const haystacks: string[] = [];
    if (task.content) haystacks.push(String(task.content).toLowerCase());
    const tags = task.metadata?.tags || task.tags;
    if (Array.isArray(tags)) haystacks.push(tags.join(' ').toLowerCase());
    const project = task.metadata?.project || task.project || task.metadata?.tgProject?.name || task.tgProject;
    if (project) haystacks.push(String(project).toLowerCase());
    const context = task.metadata?.context || task.context;
    if (context) haystacks.push(String(context).toLowerCase());
    return haystacks.some(h => h.includes(q));
  } catch {
    return true;
  }
}

// Parse priority expressions used by filter UI, returning a numeric 1..5 if recognized; otherwise null.
export function parsePriorityFilterValue(input: string | number | undefined | null): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return input;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  const map: Record<string, number> = {
    highest: 5,
    high: 4,
    medium: 3,
    normal: 3,
    moderate: 3,
    low: 2,
    lowest: 1,
    urgent: 5,
    critical: 5,
    important: 4,
    minor: 2,
    trivial: 1,
  };
  if (s in map) return map[s];
  const n = parseInt(s.replace(/^#/, ''), 10);
  return Number.isFinite(n) ? n : null;
}

