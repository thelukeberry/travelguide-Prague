import { useMemo, useState } from 'react';
import { type TransactionRow, formatDate, formatEUR } from '../api';

export function ExpensesTab({ transactions }: { transactions: TransactionRow[] }): JSX.Element {
  const categories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => t.category && set.add(t.category));
    return Array.from(set).sort();
  }, [transactions]);

  const [filter, setFilter] = useState<'all' | 'expenses' | 'income'>('expenses');
  const [category, setCategory] = useState<string>('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filter === 'expenses' && t.amount >= 0) return false;
      if (filter === 'income' && t.amount < 0) return false;
      if (category && t.category !== category) return false;
      if (search) {
        const hay = `${t.counterparty ?? ''} ${t.description ?? ''}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [transactions, filter, category, search]);

  const totals = useMemo(() => {
    let exp = 0;
    let inc = 0;
    filtered.forEach((t) => {
      if (t.amount < 0) exp += -t.amount;
      else inc += t.amount;
    });
    return { exp, inc };
  }, [filtered]);

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={filter === 'expenses' ? 'active' : ''} onClick={() => setFilter('expenses')}>
            Ausgaben
          </button>
          <button className={filter === 'income' ? 'active' : ''} onClick={() => setFilter('income')}>
            Einnahmen
          </button>
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            Alle
          </button>
        </div>

        <select
          className="search-input"
          style={{ marginBottom: 0, flex: '0 0 200px' }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <input
          className="search-input"
          style={{ marginBottom: 0, flex: 1 }}
          placeholder="Suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {filtered.length} Einträge · Ausgaben {formatEUR(totals.exp)} · Einnahmen{' '}
          {formatEUR(totals.inc)}
        </div>
      </div>

      <div className="list">
        {filtered.length === 0 && <div className="empty">Keine Einträge gefunden.</div>}
        {filtered.map((t) => (
          <div className="row" key={t.id}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {t.counterparty ?? t.description ?? 'Transaktion'}
              </div>
              <div className="meta">
                {formatDate(t.bookingDate)}
                {t.category && (
                  <>
                    {' · '}
                    <span className="pill">{t.category}</span>
                  </>
                )}
                {t.description && t.counterparty && (
                  <span style={{ marginLeft: 8, opacity: 0.7 }}>{t.description.slice(0, 80)}</span>
                )}
              </div>
            </div>
            <div className={`amount ${t.amount >= 0 ? 'pos' : 'neg'}`}>
              {formatEUR(t.amount, t.currency)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
