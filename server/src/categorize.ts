import type Database from 'better-sqlite3';

interface Rule {
  keyword: string;
  category: string;
  priority: number;
}

interface RuleCache {
  rules: Rule[];
  loadedAt: number;
}

const CACHE_TTL_MS = 60_000;
let cache: RuleCache | null = null;

function loadRules(db: Database.Database): Rule[] {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.rules;
  const rows = db
    .prepare(
      'SELECT keyword, category, priority FROM category_rules ORDER BY priority DESC, length(keyword) DESC',
    )
    .all() as Rule[];
  cache = { rules: rows, loadedAt: Date.now() };
  return rows;
}

export function invalidateRulesCache(): void {
  cache = null;
}

export function categorize(
  db: Database.Database,
  input: { description?: string | null; counterparty?: string | null; amount: number },
): string {
  const haystack = `${input.counterparty ?? ''} ${input.description ?? ''}`.toLowerCase();
  if (haystack.trim()) {
    for (const rule of loadRules(db)) {
      if (haystack.includes(rule.keyword.toLowerCase())) return rule.category;
    }
  }
  // Fallback: positive amounts (incoming) without a rule match are usually "Einkommen"-adjacent;
  // we still mark them as "Sonstiges" to avoid mis-categorising refunds/transfers.
  return 'Sonstiges';
}
