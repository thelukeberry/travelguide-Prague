import { useEffect, useMemo, useState } from 'react';
import { api, type Institution } from './api';

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'de', name: 'Deutschland' },
  { code: 'at', name: 'Österreich' },
  { code: 'ch', name: 'Schweiz' },
  { code: 'fr', name: 'Frankreich' },
  { code: 'nl', name: 'Niederlande' },
  { code: 'es', name: 'Spanien' },
  { code: 'it', name: 'Italien' },
  { code: 'gb', name: 'Vereinigtes Königreich' },
];

export function ConnectModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [country, setCountry] = useState('de');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .institutions(country)
      .then((rows) => {
        if (!cancelled) setInstitutions(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [country]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return institutions;
    return institutions.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.bic ?? '').toLowerCase().includes(q),
    );
  }, [institutions, search]);

  const connect = async (inst: Institution): Promise<void> => {
    setLinking(inst.id);
    setError(null);
    try {
      const res = await api.connect(inst.id, inst.name);
      // Hand off to bank for SCA. Bank will redirect to /callback.
      window.location.href = res.link;
    } catch (err) {
      setError((err as Error).message);
      setLinking(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Bank verbinden</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Wähle deine Bank. Du wirst zur Anmeldeseite weitergeleitet und kehrst danach automatisch
          hierher zurück.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="search-input"
            style={{ flex: '0 0 180px', marginBottom: 0 }}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="search-input"
            placeholder="Banknamen oder BIC suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 0 }}
            autoFocus
          />
        </div>

        {error && <div className="status-banner danger">{error}</div>}

        {loading ? (
          <div className="empty">
            <span className="spinner" /> Lade Banken…
          </div>
        ) : (
          <div className="institution-list">
            {filtered.map((inst) => (
              <div
                key={inst.id}
                className="row"
                onClick={() => !linking && connect(inst)}
                style={{ opacity: linking && linking !== inst.id ? 0.5 : 1 }}
              >
                {inst.logo ? (
                  <img src={inst.logo} alt="" />
                ) : (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      background: 'var(--bg-soft)',
                      borderRadius: 6,
                    }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{inst.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
                    {inst.bic ?? '—'}
                    {inst.transactionHistoryDays
                      ? ` · ${inst.transactionHistoryDays} Tage Historie`
                      : ''}
                  </div>
                </div>
                {linking === inst.id && <span className="spinner" />}
              </div>
            ))}
            {filtered.length === 0 && <div className="empty">Keine Treffer.</div>}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
