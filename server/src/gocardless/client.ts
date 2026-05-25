import { request } from 'undici';
import { config } from '../config';
import { tokenManager } from './TokenManager';
import type {
  Institution,
  EndUserAgreement,
  Requisition,
  AccountDetails,
  BalancesResponse,
  TransactionsResponse,
} from './types';

export class GoCardlessError extends Error {
  constructor(
    public status: number,
    public body: string,
    public summary?: string,
  ) {
    super(`GoCardless API error ${status}: ${summary ?? body}`);
  }

  isRateLimited(): boolean {
    return this.status === 429;
  }

  isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const token = await tokenManager.getAccessToken();
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';

  const res = await request(`${config.goCardlessBaseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.statusCode === 204) return undefined as unknown as T;

  const text = await res.body.text();
  if (res.statusCode >= 400) {
    if (res.statusCode === 401 && retry) {
      tokenManager.invalidate();
      return call<T>(method, path, body, false);
    }
    let summary: string | undefined;
    try {
      const j = JSON.parse(text);
      summary = j.summary ?? j.detail ?? j.error ?? undefined;
    } catch {
      // ignore
    }
    throw new GoCardlessError(res.statusCode, text, summary);
  }

  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

export const goCardless = {
  /** GET /institutions/?country=xx */
  listInstitutions(country: string): Promise<Institution[]> {
    return call<Institution[]>('GET', `/institutions/?country=${encodeURIComponent(country)}`);
  },

  /** POST /agreements/enduser/ */
  createAgreement(input: {
    institution_id: string;
    max_historical_days?: number;
    access_valid_for_days?: number;
    access_scope?: string[];
  }): Promise<EndUserAgreement> {
    return call<EndUserAgreement>('POST', '/agreements/enduser/', {
      institution_id: input.institution_id,
      max_historical_days: input.max_historical_days ?? 730,
      access_valid_for_days: input.access_valid_for_days ?? 90,
      access_scope: input.access_scope ?? ['balances', 'details', 'transactions'],
    });
  },

  /** POST /requisitions/ */
  createRequisition(input: {
    redirect: string;
    institution_id: string;
    agreement: string;
    reference: string;
    user_language?: string;
  }): Promise<Requisition> {
    return call<Requisition>('POST', '/requisitions/', {
      redirect: input.redirect,
      institution_id: input.institution_id,
      agreement: input.agreement,
      reference: input.reference,
      user_language: input.user_language ?? 'DE',
    });
  },

  /** GET /requisitions/<id>/ */
  getRequisition(id: string): Promise<Requisition> {
    return call<Requisition>('GET', `/requisitions/${id}/`);
  },

  /** DELETE /requisitions/<id>/ */
  deleteRequisition(id: string): Promise<void> {
    return call<void>('DELETE', `/requisitions/${id}/`);
  },

  /** GET /accounts/<id>/details/ */
  getAccountDetails(accountId: string): Promise<AccountDetails> {
    return call<AccountDetails>('GET', `/accounts/${accountId}/details/`);
  },

  /** GET /accounts/<id>/balances/ */
  getAccountBalances(accountId: string): Promise<BalancesResponse> {
    return call<BalancesResponse>('GET', `/accounts/${accountId}/balances/`);
  },

  /** GET /accounts/<id>/transactions/ */
  getAccountTransactions(
    accountId: string,
    params?: { date_from?: string; date_to?: string },
  ): Promise<TransactionsResponse> {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return call<TransactionsResponse>('GET', `/accounts/${accountId}/transactions/${suffix}`);
  },
};
