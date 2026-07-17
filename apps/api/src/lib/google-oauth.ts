import { signState, verifyState } from './crypto';

/**
 * Fluxo OAuth 2.0 do Google, dedicado ao Google Calendar. Separado do login:
 * quem quiser conectar a agenda faz isto de propósito, em Configurações.
 *
 * Escopo mínimo: só `calendar.events` (criar/editar/remover eventos criados
 * pelo Plim). NÃO pedimos leitura da agenda pessoal. `access_type=offline` +
 * `prompt=consent` garantem o refresh_token para sincronizar depois.
 */

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** Janela de validade do `state` assinado: 10 minutos entre iniciar e voltar. */
const STATE_TTL_MS = 10 * 60 * 1000;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokens {
  accessToken: string;
  /** Só vem na primeira autorização (com prompt=consent). Guarde-o. */
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
}

/** Monta a URL de consentimento e um `state` assinado com o user_id. */
export function buildAuthUrl(
  cfg: GoogleOAuthConfig,
  userId: string,
  keyForState: Buffer,
  nowMs: number,
): string {
  const state = signState(JSON.stringify({ u: userId, t: nowMs }), keyForState);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Valida o `state` do callback e devolve o user_id, ou null se inválido/expirado. */
export function readState(signed: string, keyForState: Buffer, nowMs: number): string | null {
  const payload = verifyState(signed, keyForState);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { u?: string; t?: number };
    if (!parsed.u || typeof parsed.t !== 'number') return null;
    if (nowMs - parsed.t > STATE_TTL_MS || parsed.t > nowMs + 60_000) return null;
    return parsed.u;
  } catch {
    return null;
  }
}

/** Troca o `code` do callback pelos tokens. */
export async function exchangeCode(cfg: GoogleOAuthConfig, code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(`Falha ao trocar o código do Google: ${errText(data)}`);
  }
  return toTokens(data);
}

/** Renova o access_token a partir do refresh_token guardado. */
export async function refreshAccessToken(
  cfg: GoogleOAuthConfig,
  refreshToken: string,
): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(`Falha ao renovar o token do Google: ${errText(data)}`);
  }
  // No refresh, o Google não reenvia o refresh_token: mantemos o atual.
  return { ...toTokens(data), refreshToken: data.refresh_token ?? refreshToken };
}

/** Descobre o e-mail da conta Google conectada (só para exibir no card). */
export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

/** Revoga o acesso no Google (melhor esforço; desconectar não depende disto). */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  } catch {
    /* segue: a conexão já foi marcada como desconectada no nosso banco */
  }
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

function toTokens(data: GoogleTokenResponse): GoogleTokens {
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + expiresInMs),
    scope: data.scope ?? GOOGLE_CALENDAR_SCOPE,
  };
}

function errText(data: GoogleTokenResponse | null): string {
  if (!data) return 'resposta vazia';
  return data.error_description ?? data.error ?? 'erro desconhecido';
}
