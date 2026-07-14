import { authService } from '../auth/service';

/**
 * Cliente HTTP fino. O front NÃO decide regras — só chama a API e
 * apresenta o que vier. Erros do back têm o formato { error: CODE, message? }
 * (ver apps/api/src/app.ts) e viram um ApiError com `code` estável.
 * Anexa o token JWT (quando logado) para a API autenticar.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Cache de leitura (GET) para deixar a navegação entre páginas fluida.
 * - TTL curto: um GET repetido dentro da janela reusa o resultado → troca de
 *   página vira instantânea (ex.: Home ↔ Movimentações usam os mesmos dados).
 * - Deduplicação: GETs idênticos simultâneos compartilham uma só requisição
 *   (mata as chamadas em dobro do StrictMode).
 * - Invalidação automática: qualquer mutação (POST/PATCH/DELETE) em
 *   /companies/:id limpa os GETs em cache daquela empresa — sem dado velho.
 */
const CACHE_TTL_MS = 30_000;
interface CacheEntry {
  at: number;
  data: unknown;
}
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/** Limpa todo o cache (chamar no logout — evita vazar dados entre contas). */
export function clearApiCache(): void {
  cache.clear();
  inflight.clear();
}

// ── recuperação de sessão (401) ──────────────────────────────
// Uma renovação por vez: vários 401 simultâneos compartilham o mesmo refresh.
let refreshPromise: Promise<string | null> | null = null;
function refreshOnce(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = authService.refreshSession().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// Sessão morta de vez: desloga e manda pro login, sem mostrar erro na tela.
let redirectingToLogin = false;
async function goToLogin(): Promise<void> {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  clearApiCache();
  try {
    await authService.logout();
  } catch {
    /* segue para o login de qualquer forma */
  }
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

/** Invalida entradas cujo caminho contém o trecho (ex.: um companyId). */
function invalidateByPath(path: string): void {
  const companyId = path.match(/\/companies\/([0-9a-f-]{36})/i)?.[1];
  if (!companyId) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.includes(companyId) || key === '/companies') cache.delete(key);
  }
}

async function rawFetch<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const token = await authService.getAccessToken();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        // Content-Type só quando há corpo — senão o Fastify rejeita "corpo vazio".
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Não foi possível falar com o servidor.', 0);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // Sessão expirada: tenta renovar o token e repetir uma vez. Se não recuperar,
    // vai para o login (sem estourar o erro "Sessão inválida" na tela).
    if (response.status === 401) {
      if (!isRetry) {
        const fresh = await refreshOnce();
        if (fresh) return rawFetch<T>(path, init, true);
      }
      await goToLogin();
      // Nunca resolve: a navegação assume; a UI não chega a mostrar erro.
      return new Promise<T>(() => {});
    }
    const code = (payload?.error as string) ?? 'UNKNOWN';
    const message = (payload?.message as string) ?? 'Algo deu errado.';
    throw new ApiError(code, message, response.status);
  }

  return payload as T;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();

  // Mutações: executa e invalida o cache da empresa afetada.
  if (method !== 'GET') {
    const result = await rawFetch<T>(path, init);
    invalidateByPath(path);
    return result;
  }

  // GET: cache fresco → instantâneo.
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data as T;
  }
  // GET em voo → compartilha a mesma requisição (dedup).
  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;

  const promise = rawFetch<T>(path, init)
    .then((data) => {
      cache.set(path, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      inflight.delete(path);
    });
  inflight.set(path, promise);
  return promise;
}
