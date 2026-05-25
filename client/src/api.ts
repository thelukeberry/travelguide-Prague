export interface Institution {
  id: string;
  name: string;
  bic: string | null;
  logo: string | null;
  transactionHistoryDays: number | null;
}

export interface AccountRow {
  id: string;
  iban: string | null;
  name: string | null;
  ownerName: string | null;
  currency: string | null;
  product: string | null;
  balance: number | null;
  balanceType: string | null;
  balanceUpdatedAt: string | null;
  lastSyncedAt: string | null;
  institutionName: string;
  connectionStatus: string;
  expiresAt: string | null;
  connectionId: string;
}

export interface ConnectionRow {
  id: string;
  institutionId: string;
  institutionName: string;
  status: string;
  linkedAt: string | null;
  expiresAt: string | null;
  accountCount: number;
}

export interface TransactionRow {
  id: number;
  accountId: string;
  externalId: string;
  bookingDate: string | null;
  valueDate: string | null;
  amount: number;
  currency: string;
  counterparty: string | null;
  description: string | null;
  category: string | null;
  status: string;
}

export interface Summary {
  netWorth: number;
  currency: string;
  month: {
    income: number;
    expenses: number;
    savingsRate: number;
    byCategory: Array<{ category: string; amount: number }>;
  };
  history: Array<{ month: string; income: number; expenses: number; net: number }>;
  subscriptions: Array<{
    counterparty: string;
    amount: number;
    lastDate: string;
    occurrences: number;
  }>;
  recent: Array<{
    id: number;
    bookingDate: string | null;
    amount: number;
    currency: string;
    counterparty: string | null;
    description: string | null;
    category: string | null;
  }>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let rateLimited = false;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      if (body?.rateLimited) rateLimited = true;
    } catch {
      // ignore
    }
    const err = new Error(message) as Error & { status: number; rateLimited?: boolean };
    err.status = res.status;
    err.rateLimited = rateLimited || res.status === 429;
    throw err;
  }
  return (await res.json()) as T;
}

export const api = {
  institutions: (country = 'de') =>
    request<Institution[]>(`/institutions?country=${encodeURIComponent(country)}`),
  connect: (institutionId: string, institutionName: string) =>
    request<{ connectionId: string; link: string; requisitionId: string }>(`/connect`, {
      method: 'POST',
      body: JSON.stringify({ institution_id: institutionId, institution_name: institutionName }),
    }),
  finalize: (requisitionId: string) =>
    request<{ status: string; accountIds: string[]; connectionId: string | null }>(
      `/connect/callback?requisition_id=${encodeURIComponent(requisitionId)}`,
    ),
  accounts: () => request<AccountRow[]>('/accounts'),
  connections: () => request<ConnectionRow[]>('/connections'),
  transactions: (params: { from?: string; to?: string; category?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.category) qs.set('category', params.category);
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<TransactionRow[]>(`/transactions${suffix}`);
  },
  summary: () => request<Summary>('/summary'),
  sync: () =>
    request<{ results: Array<{ accountId: string; added: number; status: string }> }>('/sync', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  deleteConnection: (id: string) =>
    request<{ ok: boolean }>(`/connections/${id}`, { method: 'DELETE' }),
};

export const formatEUR = (value: number, currency = 'EUR'): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(value);

export const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(d);
};
