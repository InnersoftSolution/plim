import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate } from 'react-router-dom';
import type { Company } from '@plim/shared';
import { companyApi, meApi, messageForError } from './companyApi';
import { clearApiCache } from '../lib/api';

/**
 * Empresa ativa (multiempresa). Um usuário pode ser membro de várias empresas;
 * este contexto guarda em qual ele está trabalhando AGORA e deixa trocar.
 *
 * Fica montado dentro do AppShell: quando as páginas renderizam, já existe uma
 * empresa ativa resolvida (senão o provider redireciona para o onboarding).
 * Para quem tem uma empresa só, o comportamento é idêntico ao de antes.
 */
interface ActiveCompanyValue {
  /** Empresa ativa (garantida quando os filhos renderizam). */
  company: Company;
  /** Todas as empresas do usuário. */
  companies: Company[];
  /** Pode criar mais de uma empresa (regra de plano). */
  canCreateMultipleCompanies: boolean;
  /** Troca a empresa ativa (persiste e faz os dados recarregarem). */
  switchCompany(companyId: string): Promise<void>;
  /** Recarrega a lista de empresas (ex.: depois de criar uma nova). */
  refresh(): Promise<Company[]>;
}

const ActiveCompanyContext = createContext<ActiveCompanyValue | null>(null);

const STORAGE_KEY = 'plim.activeCompanyId';

/** Última empresa escolhida, guardada localmente (fallback ao banco). */
export function readStoredActiveCompany(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ambiente sem localStorage: a preferência ainda vive no banco (last_active)
  }
}

/**
 * Marca uma empresa como a ativa: guarda local (imediato) e no banco (persiste
 * entre sessões). Usada pelo seletor, pela tela de seleção e pelo onboarding.
 * Se o banco falhar (ex.: migração 0025 pendente), a escolha local já vale.
 */
export async function rememberActiveCompany(id: string): Promise<void> {
  writeStored(id);
  try {
    await meApi.setActiveCompany(id);
  } catch {
    // segue com a preferência local nesta sessão
  }
}

/** Escolhe a empresa ativa: preferência do banco > localStorage > a primeira. */
function resolveActiveId(
  companies: Company[],
  lastActiveCompanyId: string | null,
): string {
  const has = (id: string | null): id is string => !!id && companies.some((c) => c.id === id);
  if (has(lastActiveCompanyId)) return lastActiveCompanyId;
  const stored = readStoredActiveCompany();
  if (has(stored)) return stored;
  return companies[0]!.id;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'onboarding' }
  | { status: 'ready'; companies: Company[]; activeId: string; canCreate: boolean };

export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [companies, me] = await Promise.all([companyApi.listMyCompanies(), meApi.get()]);
      if (companies.length === 0) {
        setState({ status: 'onboarding' });
        return;
      }
      const activeId = resolveActiveId(companies, me.lastActiveCompanyId);
      writeStored(activeId);
      setState({
        status: 'ready',
        companies,
        activeId,
        canCreate: me.canCreateMultipleCompanies,
      });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const switchCompany = useCallback(async (companyId: string) => {
    let switched = false;
    setState((s) => {
      if (s.status !== 'ready') return s;
      if (!s.companies.some((c) => c.id === companyId) || s.activeId === companyId) return s;
      switched = true;
      return { ...s, activeId: companyId };
    });
    if (!switched) return;
    // Zera o cache para os dados da nova empresa virem do zero (nada da anterior).
    clearApiCache();
    await rememberActiveCompany(companyId);
  }, []);

  const refresh = useCallback(async () => {
    const companies = await companyApi.listMyCompanies();
    setState((s) => {
      if (s.status !== 'ready') return s;
      const activeId = companies.some((c) => c.id === s.activeId)
        ? s.activeId
        : (companies[0]?.id ?? s.activeId);
      return { ...s, companies, activeId };
    });
    return companies;
  }, []);

  const value = useMemo<ActiveCompanyValue | null>(() => {
    if (state.status !== 'ready') return null;
    const company = state.companies.find((c) => c.id === state.activeId) ?? state.companies[0]!;
    return {
      company,
      companies: state.companies,
      canCreateMultipleCompanies: state.canCreate,
      switchCompany,
      refresh,
    };
  }, [state, switchCompany, refresh]);

  if (state.status === 'onboarding') return <Navigate to="/onboarding" replace />;
  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'error') return <ErrorScreen message={state.message} onRetry={load} />;

  return <ActiveCompanyContext.Provider value={value}>{children}</ActiveCompanyContext.Provider>;
}

export function useActiveCompany(): ActiveCompanyValue {
  const ctx = useContext(ActiveCompanyContext);
  if (!ctx) throw new Error('useActiveCompany precisa estar dentro de <ActiveCompanyProvider>');
  return ctx;
}

function LoadingScreen() {
  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-subtle)',
        fontSize: 14,
      }}
    >
      carregando…
    </main>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-subtle)',
        fontSize: 14,
      }}
    >
      <span>{message}</span>
      <button type="button" className="btn btn--ghost" onClick={onRetry}>
        Tentar de novo
      </button>
    </main>
  );
}
