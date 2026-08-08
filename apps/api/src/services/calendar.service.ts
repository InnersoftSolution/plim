import type { CalendarConnection as CalendarConnectionDto } from '@plim/shared';
import type { CalendarConnection } from '../domain/calendar';
import type { CalendarRepository } from '../repositories/calendar.repository';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import {
  buildAuthUrl,
  exchangeCode,
  fetchAccountEmail,
  generateNonce,
  readState,
  refreshAccessToken,
  revokeToken,
  type GoogleOAuthConfig,
} from '../lib/google-oauth';
import { DomainError } from '../lib/errors';

export interface CalendarServiceConfig {
  oauth: GoogleOAuthConfig;
  /** Chave de 32 bytes que cifra tokens e assina o `state`. */
  tokenKey: Buffer;
  /** Origem do app web, para redirecionar depois do callback. */
  webOrigin: string;
}

/** Buffer de segurança: renova o access_token 60s antes de expirar. */
const EXPIRY_SKEW_MS = 60_000;

/** Janela em que um nonce de state fica "gasto" (>= TTL do state, 10 min). */
const NONCE_TTL_MS = 15 * 60 * 1000;

/**
 * Conexão do usuário com o Google Calendar (OAuth dedicado). Guarda os tokens
 * cifrados, entrega o access_token válido ao motor de sync e cuida de conectar
 * e desconectar. Nunca lê a agenda pessoal: o escopo é só `calendar.events`.
 */
export class CalendarService {
  /**
   * Nonces de state já consumidos (uso único). Guarda o instante em que cada um
   * foi usado; entradas velhas são varridas na próxima checagem. Em memória: um
   * callback só é aceito uma vez por processo, fechando o replay da URL de volta.
   */
  private readonly usedNonces = new Map<string, number>();

  constructor(
    private readonly repo: CalendarRepository,
    private readonly config: CalendarServiceConfig,
  ) {}

  /** Marca o nonce como usado; devolve false se já tinha sido usado antes. */
  private consumeNonce(nonce: string, nowMs: number): boolean {
    for (const [n, at] of this.usedNonces) {
      if (nowMs - at > NONCE_TTL_MS) this.usedNonces.delete(n);
    }
    if (this.usedNonces.has(nonce)) return false;
    this.usedNonces.set(nonce, nowMs);
    return true;
  }

  /** Estado da conexão do usuário atual (o card do frontend). */
  async getConnection(userId: string): Promise<CalendarConnectionDto> {
    const conn = await this.repo.getConnection(userId);
    return toDto(conn);
  }

  /**
   * Passo 1: URL de consentimento do Google, com `state` assinado, mais o
   * `nonce` que a rota grava num cookie no navegador de quem iniciou. O callback
   * exige que o cookie bata com o nonce do state (vínculo com o navegador).
   */
  startConnect(userId: string): { url: string; nonce: string } {
    const nonce = generateNonce();
    const url = buildAuthUrl(this.config.oauth, userId, nonce, this.config.tokenKey, Date.now());
    return { url, nonce };
  }

  /**
   * Passo 2 (callback): valida o `state`, troca o código por tokens, guarda a
   * conexão cifrada e devolve para onde redirecionar o usuário no app web.
   */
  async handleCallback(
    params: {
      code?: string;
      state?: string;
      error?: string;
    },
    cookieNonce?: string | null,
  ): Promise<string> {
    const backTo = (status: string) =>
      `${this.config.webOrigin}/agenda?google=${status}`;

    if (params.error) return backTo('error');
    if (!params.code || !params.state) return backTo('error');

    const now = Date.now();
    const parsed = readState(params.state, this.config.tokenKey, now);
    if (!parsed) return backTo('error');
    // Vínculo com o navegador: o cookie gravado no /connect precisa bater com o
    // nonce do state. Sem isso (ou diferente), quem completa não é quem iniciou
    // -> recusa. Fecha o cenário de linkar a agenda de outra pessoa (OAuth CSRF).
    if (!cookieNonce || cookieNonce !== parsed.nonce) return backTo('error');
    // Uso único: um mesmo state (mesma URL de callback) não vale duas vezes.
    if (!this.consumeNonce(parsed.nonce, now)) return backTo('error');
    const userId = parsed.userId;

    try {
      const tokens = await exchangeCode(this.config.oauth, params.code);
      const email = await fetchAccountEmail(tokens.accessToken);
      const connectedAt = new Date();
      await this.repo.upsertConnection({
        userId,
        provider: 'google',
        providerAccountEmail: email,
        accessTokenEncrypted: encryptSecret(tokens.accessToken, this.config.tokenKey),
        refreshTokenEncrypted: tokens.refreshToken
          ? encryptSecret(tokens.refreshToken, this.config.tokenKey)
          : null,
        tokenExpiresAt: tokens.expiresAt,
        scope: tokens.scope,
        status: 'connected',
        connectedAt,
        disconnectedAt: null,
      });
      return backTo('connected');
    } catch {
      return backTo('error');
    }
  }

  /** Desconecta: para futuras sincronizações e revoga o acesso no Google. */
  async disconnect(userId: string): Promise<CalendarConnectionDto> {
    const conn = await this.repo.getConnection(userId);
    if (!conn || conn.status !== 'connected') return toDto(conn);

    // Revoga no Google (melhor esforço) usando o refresh token, se houver.
    const refresh = conn.refreshTokenEncrypted
      ? safeDecrypt(conn.refreshTokenEncrypted, this.config.tokenKey)
      : null;
    if (refresh) await revokeToken(refresh);

    const updated = await this.repo.upsertConnection({
      userId,
      provider: 'google',
      providerAccountEmail: conn.providerAccountEmail,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      scope: conn.scope,
      status: 'disconnected',
      connectedAt: conn.connectedAt,
      disconnectedAt: new Date(),
    });
    return toDto(updated);
  }

  /**
   * Devolve um access_token válido para o usuário, renovando se necessário.
   * Retorna null quando não dá para sincronizar (sem conexão ativa ou sem como
   * renovar) e, nesse caso, marca a conexão como expirada.
   */
  async getValidAccessToken(userId: string): Promise<string | null> {
    const conn = await this.repo.getConnection(userId);
    if (!conn || conn.status !== 'connected' || !conn.accessTokenEncrypted) return null;

    const fresh =
      conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
    if (fresh) {
      const token = safeDecrypt(conn.accessTokenEncrypted, this.config.tokenKey);
      if (token) return token;
    }

    // Precisa renovar.
    const refresh = conn.refreshTokenEncrypted
      ? safeDecrypt(conn.refreshTokenEncrypted, this.config.tokenKey)
      : null;
    if (!refresh) {
      await this.repo.updateTokens(userId, {
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
        status: 'expired',
      });
      return null;
    }

    try {
      const tokens = await refreshAccessToken(this.config.oauth, refresh);
      await this.repo.updateTokens(userId, {
        accessTokenEncrypted: encryptSecret(tokens.accessToken, this.config.tokenKey),
        refreshTokenEncrypted: tokens.refreshToken
          ? encryptSecret(tokens.refreshToken, this.config.tokenKey)
          : conn.refreshTokenEncrypted,
        tokenExpiresAt: tokens.expiresAt,
        status: 'connected',
      });
      return tokens.accessToken;
    } catch {
      await this.repo.updateTokens(userId, {
        accessTokenEncrypted: conn.accessTokenEncrypted,
        refreshTokenEncrypted: conn.refreshTokenEncrypted,
        tokenExpiresAt: conn.tokenExpiresAt,
        status: 'error',
      });
      return null;
    }
  }
}

function toDto(conn: CalendarConnection | null): CalendarConnectionDto {
  if (!conn) {
    return {
      provider: 'google',
      connected: false,
      status: 'disconnected',
      accountEmail: null,
      connectedAt: null,
    };
  }
  return {
    provider: 'google',
    connected: conn.status === 'connected',
    status: conn.status,
    accountEmail: conn.providerAccountEmail,
    connectedAt: conn.connectedAt ? conn.connectedAt.toISOString() : null,
  };
}

function safeDecrypt(payload: string, key: Buffer): string | null {
  try {
    return decryptSecret(payload, key);
  } catch {
    return null;
  }
}

/** Erro de configuração ausente (rotas usam para responder 503 amigável). */
export class CalendarNotConfiguredError extends DomainError {
  constructor() {
    super('CALENDAR_NOT_CONFIGURED', 'A integração com o Google Calendar não está disponível.', 503);
  }
}
