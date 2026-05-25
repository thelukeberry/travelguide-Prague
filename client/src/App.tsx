import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, Plus, AlertTriangle, Wallet } from 'lucide-react';
import { api, type AccountRow, type Summary, type TransactionRow, formatEUR } from './api';
import { OverviewTab } from './tabs/OverviewTab';
import { AccountsTab } from './tabs/AccountsTab';
import { ExpensesTab } from './tabs/ExpensesTab';
import { SubscriptionsTab } from './tabs/SubscriptionsTab';
import { ConnectModal } from './ConnectModal';
import { CallbackPage } from './CallbackPage';

type Tab = 'overview' | 'accounts' | 'expenses' | 'subscriptions';

export function App(): JSX.Element {
  const isCallback = typeof window !== 'undefined' && window.location.pathname === '/callback';
  if (isCallback) return <CallbackPage />;

  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [s, a, t] = await Promise.all([
        api.summary(),
        api.accounts(),
        api.transactions({ limit: 500 }),
      ]);
      setSummary(s);
      setAccounts(a);
      setTransactions(t);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onSync = async (): Promise<void> => {
    setSyncing(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.sync();
      const totalAdded = res.results.reduce((sum, r) => sum + (r.added ?? 0), 0);
      const rateLimited = res.results.some((r) => r.status === 'rate_limited');
      if (rateLimited) {
        setInfo(
          `Sync abgeschlossen, aber mindestens ein Konto wurde durch das Bank-Rate-Limit (max. ~4 Abrufe pro Tag) gedrosselt. Versuch es später erneut.`,
        );
      } else {
        setInfo(`Synchronisierung fertig – ${totalAdded} neue Transaktionen.`);
      }
      await loadAll();
    } catch (err) {
      const e = err as Error & { rateLimited?: boolean };
      setError(
        e.rateLimited
          ? 'Rate-Limit erreicht. Die Bank erlaubt nur eine begrenzte Anzahl Abrufe pro Tag.'
          : e.message,
      );
    } finally {
      setSyncing(false);
    }
  };

  const expiringSoon = useMemo(() => {
    return accounts.filter((a) => {
      if (!a.expiresAt) return false;
      const days = (new Date(a.expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000);
      return days <= 7;
    });
  }, [accounts]);

  const expired = useMemo(() => accounts.filter((a) => a.connectionStatus === 'EX'), [accounts]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <Wallet size={22} /> Finanzen
        </h1>
        <div className="actions">
          <button className="btn" onClick={() => setShowConnect(true)}>
            <Plus size={16} /> Bank verbinden
          </button>
          <button className="btn btn-primary" onClick={onSync} disabled={syncing}>
            {syncing ? <span className="spinner" /> : <RefreshCw size={16} />}
            Jetzt synchronisieren
          </button>
        </div>
      </header>

      {error && (
        <div className="status-banner danger">
          <div>
            <AlertTriangle size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {error}
          </div>
          <button className="btn btn-ghost" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {info && (
        <div className="status-banner">
          <div>{info}</div>
          <button className="btn btn-ghost" onClick={() => setInfo(null)}>
            ×
          </button>
        </div>
      )}
      {expired.length > 0 && (
        <div className="status-banner danger">
          <div>
            {expired.length} Bankverbindung(en) abgelaufen (PSD2 fordert nach 90 Tagen erneute
            Zustimmung). Verbinde die Bank neu, damit der Sync wieder läuft.
          </div>
          <button className="btn btn-danger" onClick={() => setShowConnect(true)}>
            Bank neu verbinden
          </button>
        </div>
      )}
      {expiringSoon.length > 0 && expired.length === 0 && (
        <div className="status-banner warning">
          <div>
            Achtung: {expiringSoon.length} Bankverbindung(en) laufen in den nächsten 7 Tagen ab.
          </div>
          <button className="btn" onClick={() => setShowConnect(true)}>
            Erneuern
          </button>
        </div>
      )}

      <Hero summary={summary} />

      <div className="tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          Übersicht
        </button>
        <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>
          Konten
        </button>
        <button className={tab === 'expenses' ? 'active' : ''} onClick={() => setTab('expenses')}>
          Ausgaben
        </button>
        <button
          className={tab === 'subscriptions' ? 'active' : ''}
          onClick={() => setTab('subscriptions')}
        >
          Abos
        </button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState onConnect={() => setShowConnect(true)} />
      ) : (
        <>
          {tab === 'overview' && (
            <OverviewTab summary={summary} transactions={transactions.slice(0, 10)} />
          )}
          {tab === 'accounts' && <AccountsTab accounts={accounts} onReconnect={() => setShowConnect(true)} onChanged={loadAll} />}
          {tab === 'expenses' && <ExpensesTab transactions={transactions} />}
          {tab === 'subscriptions' && <SubscriptionsTab summary={summary} />}
        </>
      )}

      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

function Hero({ summary }: { summary: Summary | null }): JSX.Element {
  const currency = summary?.currency ?? 'EUR';
  return (
    <div className="hero">
      <div className="label">Netto-Vermögen</div>
      <div className="net">{summary ? formatEUR(summary.netWorth, currency) : '—'}</div>
      <div className="meta">
        <div className="item">
          <div className="l">Einnahmen (Monat)</div>
          <div className="v">{summary ? formatEUR(summary.month.income, currency) : '—'}</div>
        </div>
        <div className="item">
          <div className="l">Ausgaben (Monat)</div>
          <div className="v">{summary ? formatEUR(summary.month.expenses, currency) : '—'}</div>
        </div>
        <div className="item">
          <div className="l">Sparquote</div>
          <div className="v">
            {summary ? `${Math.round(summary.month.savingsRate * 100)} %` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onConnect }: { onConnect: () => void }): JSX.Element {
  return (
    <div className="card">
      <div className="empty">
        <Building2 size={32} style={{ opacity: 0.5 }} />
        <h3 style={{ margin: '12px 0 4px', color: 'var(--ink)' }}>Noch keine Bank verbunden</h3>
        <p>Verbinde deine erste Bank, um Konten und Transaktionen automatisch zu importieren.</p>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onConnect}>
          <Plus size={16} /> Bank verbinden
        </button>
      </div>
    </div>
  );
}
