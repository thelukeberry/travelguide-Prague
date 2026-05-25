import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { type Summary, type TransactionRow, formatEUR, formatDate } from '../api';

const PIE_COLORS = [
  '#0b3d2e',
  '#1f6b53',
  '#3f8e72',
  '#6fa890',
  '#a8c5b3',
  '#b07a1a',
  '#d4a64a',
  '#b13a3a',
  '#5a6472',
  '#8a93a0',
];

export function OverviewTab({
  summary,
  transactions,
}: {
  summary: Summary | null;
  transactions: TransactionRow[];
}): JSX.Element {
  if (!summary) {
    return (
      <div className="card">
        <div className="empty">
          <span className="spinner" /> Lade Zusammenfassung…
        </div>
      </div>
    );
  }

  const pieData = summary.month.byCategory.map((c) => ({
    name: c.category,
    value: Math.round(c.amount * 100) / 100,
  }));

  const historyData = summary.history.map((h) => ({
    month: h.month.slice(2),
    Einnahmen: Math.round(h.income * 100) / 100,
    Ausgaben: Math.round(h.expenses * 100) / 100,
  }));

  return (
    <>
      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h2>Ausgaben nach Kategorie (Monat)</h2>
          {pieData.length === 0 ? (
            <div className="empty">Keine Ausgaben in diesem Monat.</div>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatEUR(v, summary.currency)} />
                  <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Letzte 6 Monate</h2>
          {historyData.length === 0 ? (
            <div className="empty">Noch keine Historie.</div>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={historyData}>
                  <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis
                    tickFormatter={(v) => `${Math.round(v / 100) / 10}k`}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <Tooltip formatter={(v: number) => formatEUR(v, summary.currency)} />
                  <Legend />
                  <Bar dataKey="Einnahmen" fill="#1f6b53" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Ausgaben" fill="#b07a1a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Anstehende Abos</h2>
          <div className="list">
            {summary.subscriptions.length === 0 && (
              <div className="empty">Noch keine wiederkehrenden Zahlungen erkannt.</div>
            )}
            {summary.subscriptions.slice(0, 8).map((s, i) => (
              <div className="row" key={i}>
                <div>
                  <div style={{ fontWeight: 500 }}>{s.counterparty}</div>
                  <div className="meta">
                    zuletzt {formatDate(s.lastDate)} · {s.occurrences}× erkannt
                  </div>
                </div>
                <div className="amount neg">{formatEUR(s.amount, summary.currency)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Letzte Transaktionen</h2>
          <div className="list">
            {transactions.length === 0 && <div className="empty">Noch keine Transaktionen.</div>}
            {transactions.map((t) => (
              <div className="row" key={t.id}>
                <div style={{ minWidth: 0 }}>
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
                    {t.category && <> · <span className="pill">{t.category}</span></>}
                  </div>
                </div>
                <div className={`amount ${t.amount >= 0 ? 'pos' : 'neg'}`}>
                  {formatEUR(t.amount, t.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
