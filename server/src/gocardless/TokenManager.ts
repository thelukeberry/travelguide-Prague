import { request } from 'undici';
import { config, assertSecretsConfigured } from '../config';
import type { TokenResponse, RefreshResponse } from './types';

interface CachedTokens {
  access: string;
  accessExpiresAt: number;
  refresh: string;
  refreshExpiresAt: number;
}

const EXPIRY_SAFETY_MS = 60_000;

export class TokenManager {
  private tokens: CachedTokens | null = null;
  private inflight: Promise<string> | null = null;

  async getAccessToken(): Promise<string> {
    if (this.tokens && this.tokens.accessExpiresAt - EXPIRY_SAFETY_MS > Date.now()) {
      return this.tokens.access;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.acquire();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  invalidate(): void {
    this.tokens = null;
  }

  private async acquire(): Promise<string> {
    if (this.tokens && this.tokens.refreshExpiresAt - EXPIRY_SAFETY_MS > Date.now()) {
      try {
        const refreshed = await this.refresh(this.tokens.refresh);
        this.tokens = {
          access: refreshed.access,
          accessExpiresAt: Date.now() + refreshed.access_expires * 1000,
          refresh: this.tokens.refresh,
          refreshExpiresAt: this.tokens.refreshExpiresAt,
        };
        return this.tokens.access;
      } catch (err) {
        // Refresh failed — fall through to a fresh token request.
        this.tokens = null;
      }
    }
    const fresh = await this.fetchNewToken();
    this.tokens = {
      access: fresh.access,
      accessExpiresAt: Date.now() + fresh.access_expires * 1000,
      refresh: fresh.refresh,
      refreshExpiresAt: Date.now() + fresh.refresh_expires * 1000,
    };
    return this.tokens.access;
  }

  private async fetchNewToken(): Promise<TokenResponse> {
    assertSecretsConfigured();
    const res = await request(`${config.goCardlessBaseUrl}/token/new/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ secret_id: config.secretId, secret_key: config.secretKey }),
    });
    if (res.statusCode >= 400) {
      const body = await res.body.text();
      throw new Error(`Failed to obtain access token (${res.statusCode}): ${body}`);
    }
    return (await res.body.json()) as TokenResponse;
  }

  private async refresh(refreshToken: string): Promise<RefreshResponse> {
    const res = await request(`${config.goCardlessBaseUrl}/token/refresh/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (res.statusCode >= 400) {
      const body = await res.body.text();
      throw new Error(`Failed to refresh access token (${res.statusCode}): ${body}`);
    }
    return (await res.body.json()) as RefreshResponse;
  }
}

export const tokenManager = new TokenManager();
