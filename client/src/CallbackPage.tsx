import { useEffect, useState } from 'react';
import { api } from './api';

const STATUS_LABELS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  CR: { label: 'Erstellt – noch nicht autorisiert', tone: 'warn' },
  GC: { label: 'Wartet auf Zustimmung', tone: 'warn' },
  UA: { label: 'Authentifizierung läuft', tone: 'warn' },
  RJ: { label: 'Abgelehnt', tone: 'bad' },
  SA: { label: 'Kontoauswahl ausstehend', tone: 'warn' },
  GA: { label: 'Zugriff wird gewährt', tone: 'warn' },
  LN: { label: 'Erfolgreich verbunden', tone: 'ok' },
  EX: { label: 'Zugriff abgelaufen – bitte erneuern', tone: 'bad' },
  SU: { label: 'Verbindung pausiert', tone: 'bad' },
};

export function CallbackPage(): JSX.Element {
  const [state, setState] = useState<'pending' | 'done' | 'error'>('pending');
  const [status, setStatus] = useState<string>('');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const requisitionId = url.searchParams.get('requisition_id') ?? '';
    const ref = url.searchParams.get('ref') ?? '';
    const lookup = requisitionId
      ? `?requisition_id=${encodeURIComponent(requisitionId)}`
      : ref
        ? `?ref=${encodeURIComponent(ref)}`
        : '';
    if (!lookup) {
      setError('Keine Requisition-ID in der URL gefunden.');
      setState('error');
      return;
    }
    fetch(`/api/connect/callback${lookup}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{
          status: string;
          accountIds: string[];
          connectionId: string | null;
        }>;
      })
      .then((body) => {
        setStatus(body.status);
        setAccountIds(body.accountIds ?? []);
        setState('done');
      })
      .catch((err: Error) => {
        setError(err.message);
        setState('error');
      });
  }, []);

  return (
    <div className="app" style={{ maxWidth: 640 }}>
      <div className="card" style={{ textAlign: 'center', padding: 36 }}>
        <h2 style={{ marginTop: 0 }}>Verbindung wird abgeschlossen</h2>

        {state === 'pending' && (
          <p>
            <span className="spinner" /> Konten werden geladen…
          </p>
        )}

        {state === 'error' && (
          <>
            <p style={{ color: 'var(--danger)' }}>{error}</p>
            <a className="btn btn-primary" href="/">
              Zurück zum Dashboard
            </a>
          </>
        )}

        {state === 'done' && (
          <>
            <p>
              Status:{' '}
              <span
                className={`pill ${
                  STATUS_LABELS[status]?.tone === 'ok'
                    ? 'success'
                    : STATUS_LABELS[status]?.tone === 'bad'
                      ? 'danger'
                      : 'warning'
                }`}
              >
                {STATUS_LABELS[status]?.label ?? status}
              </span>
            </p>
            {accountIds.length > 0 && (
              <p className="muted">
                {accountIds.length} Konto/Konten erkannt und werden im Hintergrund synchronisiert.
              </p>
            )}
            <a className="btn btn-primary" href="/">
              Zum Dashboard
            </a>
          </>
        )}
      </div>
    </div>
  );
}
