import { api, type AccountRow, formatDate, formatEUR } from '../api';

const STATUS: Record<string, string> = {
  CR: 'Erstellt',
  GC: 'Wartet auf Zustimmung',
  UA: 'Auth läuft',
  RJ: 'Abgelehnt',
  SA: 'Kontoauswahl',
  GA: 'Zugriff wird gewährt',
  LN: 'Aktiv',
  EX: 'Abgelaufen',
  SU: 'Pausiert',
};

export function AccountsTab({
  accounts,
  onReconnect,
  onChanged,
}: {
  accounts: AccountRow[];
  onReconnect: () => void;
  onChanged: () => void | Promise<void>;
}): JSX.Element {
  const disconnect = async (connectionId: string): Promise<void> => {
    if (!confirm('Diese Verbindung wirklich trennen? Lokal gespeicherte Transaktionen werden ebenfalls gelöscht.')) return;
    try {
      await api.deleteConnection(connectionId);
      await onChanged();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="card">
      <h2>Konten ({accounts.length})</h2>
      <div className="accounts-grid">
        {accounts.map((a) => {
          const expired = a.connectionStatus === 'EX';
          return (
            <div className="account-card" key={a.id}>
              <div className="name">
                {a.name ?? a.product ?? 'Konto'}{' '}
                <span
                  className={`pill ${
                    a.connectionStatus === 'LN'
                      ? 'success'
                      : expired
                        ? 'danger'
                        : 'warning'
                  }`}
                  style={{ marginLeft: 4 }}
                >
                  {STATUS[a.connectionStatus] ?? a.connectionStatus}
                </span>
              </div>
              <div className="iban">{a.iban ?? '—'}</div>
              <div className="bal">
                {a.balance != null ? formatEUR(a.balance, a.currency ?? 'EUR') : '—'}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {a.institutionName}
                {a.balanceType ? ` · ${a.balanceType}` : ''}
              </div>
              <div className="footer">
                <span>Synced: {formatDate(a.lastSyncedAt)}</span>
                <span>Verfällt: {formatDate(a.expiresAt)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                {expired && (
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={onReconnect}>
                    Neu verbinden
                  </button>
                )}
                <button
                  className="btn btn-danger"
                  style={{ flex: 1 }}
                  onClick={() => disconnect(a.connectionId)}
                >
                  Trennen
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
