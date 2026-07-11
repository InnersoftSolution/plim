import { useEffect, useState } from 'react';
import type { AdminRole } from '@plim/shared';
import { adminApi } from './adminApi';

interface AdminMeState {
  loading: boolean;
  /** null = usuário comum (esconder menu/negar rota). */
  role: AdminRole | null;
}

// Cache de módulo: a resposta do /admin/me vale para a sessão inteira —
// evita reperguntar a cada montagem de componente (menu + guard).
let cached: AdminRole | null | undefined;
let inflight: Promise<AdminRole | null> | null = null;

async function fetchRole(): Promise<AdminRole | null> {
  try {
    const me = await adminApi.me();
    return me.role;
  } catch {
    return null; // 403/erro → usuário comum; o front só esconde, a API nega.
  }
}

/** Papel administrativo do usuário logado (null = comum). */
export function useAdminMe(): AdminMeState {
  const [state, setState] = useState<AdminMeState>(() =>
    cached !== undefined ? { loading: false, role: cached } : { loading: true, role: null },
  );

  useEffect(() => {
    if (cached !== undefined) return;
    inflight ??= fetchRole();
    let alive = true;
    inflight.then((role) => {
      cached = role;
      if (alive) setState({ loading: false, role });
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/** Limpa o cache (chamar no logout). */
export function clearAdminMeCache(): void {
  cached = undefined;
  inflight = null;
}
