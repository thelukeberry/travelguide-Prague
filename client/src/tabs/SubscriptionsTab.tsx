import { type Summary, formatDate, formatEUR } from '../api';

export function SubscriptionsTab({ summary }: { summary: Summary | null }): JSX.Element {
  if (!summary) return <div className="card">Lade…</div>;

  const monthlyTotal = summary.subscriptions.reduce((sum, s) => sum + Math.abs(s.amount), 0);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>Wiederkehrende Zahlungen</h3>
        <div className="muted">
          Gesamt erkannt: <strong>{formatEUR(monthlyTotal, summary.currency)}</strong>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        Diese Liste basiert auf wiederkehrenden Beträgen beim selben Empfänger der letzten 6 Monate.
      </p>

      <div className="list">
        {summary.subscriptions.length === 0 && (
          <div className="empty">Noch keine Abos erkannt. Mehr Sync-Historie erhöht die Trefferquote.</div>
        )}
        {summary.subscriptions.map((s, i) => (
          <div className="row" key={i}>
            <div>
              <div style={{ fontWeight: 500 }}>{s.counterparty}</div>
              <div className="meta">
                zuletzt {formatDate(s.lastDate)} · {s.occurrences} Monate in Folge
              </div>
            </div>
            <div className="amount neg">{formatEUR(s.amount, summary.currency)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
