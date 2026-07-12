import type { ChecklistStatus } from '@plim/shared';
import type { ChecklistAutoRule, ChecklistSignals, ChecklistTemplate } from '../domain/checklist';

/**
 * Catalogo dos itens que o Plim sugere. Fonte unica da verdade (serve tanto
 * para Postgres quanto para o modo in-memory). A separacao "template vs item
 * da empresa" acontece na geracao: cada template vira uma linha em
 * company_checklist_items, com status proprio.
 *
 * `key` deve ser estavel (nao renomear apos publicar): e por ela que a
 * geracao evita duplicar e que as regras automaticas encontram o item.
 */
export const checklistCatalog: ReadonlyArray<ChecklistTemplate> = [
  // Fase 1 - Ideia e posicionamento
  {
    key: 'company_name',
    title: 'Nome da empresa',
    description: 'Definir um nome dá identidade ao projeto e facilita domínio, marca e comunicação.',
    phase: 'idea',
    priority: 'high',
    actionLabel: 'Editar nome',
    actionRoute: '/empresa/dados',
    autoRule: 'has_name',
  },
  {
    key: 'idea_description',
    title: 'Descrição da ideia',
    description: 'Uma descrição curta ajuda sócios e parceiros a entenderem o que a empresa faz.',
    phase: 'idea',
    priority: 'high',
    actionLabel: 'Completar descrição',
    actionRoute: '/empresa/dados',
    autoRule: 'has_description',
  },
  {
    key: 'target_audience',
    title: 'Público-alvo',
    description: 'Definir para quem a empresa existe ajuda em produto, preço, comunicação e vendas.',
    phase: 'idea',
    priority: 'medium',
  },
  {
    key: 'problem_statement',
    title: 'Problema que resolve',
    description: 'Toda empresa resolve uma dor clara. Registrar isso ajuda a manter o foco.',
    phase: 'idea',
    priority: 'medium',
  },
  {
    key: 'value_proposition',
    title: 'Proposta de valor',
    description: 'Explique por que alguém escolheria a sua solução em vez de outra.',
    phase: 'idea',
    priority: 'medium',
  },
  {
    key: 'mission',
    title: 'Missão',
    description: 'A missão diz por que a empresa existe hoje e o que ela entrega para as pessoas.',
    phase: 'idea',
    priority: 'low',
  },
  {
    key: 'vision',
    title: 'Visão',
    description: 'A visão descreve aonde a empresa quer chegar e como quer ser vista no futuro.',
    phase: 'idea',
    priority: 'low',
  },

  // Fase 2 - Marca e presenca
  {
    key: 'logo',
    title: 'Logo',
    description: 'A logo começa a criar reconhecimento visual e deixa o ambiente do Plim mais personalizado.',
    phase: 'brand',
    priority: 'medium',
    actionLabel: 'Adicionar logo',
    actionRoute: '/empresa/dados',
    recommendedPartnerCategory: 'design',
    autoRule: 'has_logo',
  },
  {
    key: 'domain',
    title: 'Domínio',
    description: 'Registrar um domínio protege o nome e prepara site e e-mail profissional.',
    phase: 'brand',
    priority: 'medium',
    recommendedPartnerCategory: 'development',
  },
  {
    key: 'social_media',
    title: 'Redes sociais',
    description: 'Reservar as redes evita perder o nome e ajuda no lançamento.',
    phase: 'brand',
    priority: 'low',
  },
  {
    key: 'professional_email',
    title: 'E-mail profissional',
    description: 'Um e-mail profissional deixa a comunicação mais confiável para clientes e parceiros.',
    phase: 'brand',
    priority: 'low',
  },
  {
    key: 'landing_page',
    title: 'Site ou landing page',
    description: 'Uma página simples já explica a ideia, capta interessados ou valida demanda.',
    phase: 'brand',
    priority: 'medium',
    recommendedPartnerCategory: 'development',
  },

  // Fase 3 - Sociedade e formalizacao
  {
    key: 'partners_registered',
    title: 'Sócios cadastrados',
    description: 'Cadastrar sócios organiza papéis, responsabilidades e futuros acertos.',
    phase: 'partnership',
    priority: 'high',
    actionLabel: 'Ver sócios',
    actionRoute: '/socios',
    autoRule: 'has_partners',
  },
  {
    key: 'equity_defined',
    title: 'Participação societária definida',
    description: 'Definir os percentuais ajuda o Plim a calcular despesas compartilhadas e acertos.',
    phase: 'partnership',
    priority: 'high',
    actionLabel: 'Definir participação',
    actionRoute: '/socios',
    autoRule: 'equity_100',
  },
  {
    key: 'partner_roles',
    title: 'Papel de cada sócio',
    description: 'Registrar quem cuida de produto, tecnologia, financeiro ou marketing evita confusão.',
    phase: 'partnership',
    priority: 'medium',
    actionLabel: 'Ver sócios',
    actionRoute: '/socios',
  },
  {
    key: 'founders_agreement',
    title: 'Acordo entre sócios',
    description: 'Um acordo alinha responsabilidades, saída de sócio, investimento e divisão.',
    phase: 'partnership',
    priority: 'medium',
    recommendedPartnerCategory: 'legal',
  },
  {
    key: 'legal_structure',
    title: 'Natureza jurídica',
    description:
      'O tipo de empresa pode afetar impostos e obrigações. O Plim organiza a pendência, mas talvez faça sentido conversar com um contador sobre as opções.',
    phase: 'partnership',
    priority: 'medium',
    actionLabel: 'Ver dados da empresa',
    actionRoute: '/empresa/dados',
    recommendedPartnerCategory: 'accounting',
  },

  // Fase 4 - Financeiro inicial
  {
    key: 'first_movement',
    title: 'Primeira movimentação registrada',
    description: 'Registrar o primeiro gasto, aporte ou custo mostra quanto já foi investido.',
    phase: 'finance',
    priority: 'high',
    actionLabel: 'Adicionar movimentação',
    actionRoute: '/financeiro',
    autoRule: 'has_movement',
  },
  {
    key: 'recurring_costs',
    title: 'Custos recorrentes',
    description: 'Registrar os custos mensais ajuda a entender quanto custa manter a empresa.',
    phase: 'finance',
    priority: 'medium',
    actionLabel: 'Ver movimentações',
    actionRoute: '/financeiro',
    autoRule: 'has_recurring',
  },
  {
    key: 'business_bank_account',
    title: 'Conta bancária da empresa',
    description: 'Separar a conta da empresa da conta pessoal ajuda na organização financeira.',
    phase: 'finance',
    priority: 'medium',
  },
  {
    key: 'pricing',
    title: 'Precificação inicial',
    description: 'Definir preço ajuda a validar o modelo e organizar metas de venda.',
    phase: 'finance',
    priority: 'medium',
  },

  // Fase 5 - Produto, operacao e vendas
  {
    key: 'main_offer',
    title: 'Oferta principal',
    description: 'Definir o que a empresa vende organiza produto, comunicação e preço.',
    phase: 'product',
    priority: 'medium',
  },
  {
    key: 'mvp',
    title: 'MVP ou primeira versão',
    description: 'Definir um MVP ajuda a começar pequeno e testar rápido.',
    phase: 'product',
    priority: 'medium',
  },
  {
    key: 'sales_process',
    title: 'Processo de venda',
    description: 'Registrar como a empresa pretende vender organiza as ações comerciais.',
    phase: 'product',
    priority: 'low',
  },
  {
    key: 'validation',
    title: 'Primeiros clientes ou validação',
    description: 'Conversar com potenciais clientes valida se a ideia resolve uma dor real.',
    phase: 'product',
    priority: 'medium',
  },

  // Fase 6 - Rotina e acompanhamento
  {
    key: 'weekly_activities',
    title: 'Atividades da semana',
    description: 'Organizar as tarefas semanais ajuda os sócios a saberem quem faz o quê.',
    phase: 'routine',
    priority: 'medium',
    actionLabel: 'Criar atividade',
    actionRoute: '/atividades',
    autoRule: 'has_activities',
  },
  {
    key: 'weekly_meeting',
    title: 'Reunião semanal',
    description: 'Uma conversa semanal ajuda os sócios a acompanhar avanços, bloqueios e próximos passos.',
    phase: 'routine',
    priority: 'low',
  },
];

/**
 * Aplica uma regra automatica sobre os sinais da empresa e devolve o status.
 * Retorna `null` quando a regra ainda nao concluiu (deixa o status como esta).
 */
export function autoStatus(rule: ChecklistAutoRule, s: ChecklistSignals): ChecklistStatus | null {
  switch (rule) {
    case 'has_name':
      if (!s.name) return null;
      return s.isNameTemporary ? 'in_progress' : 'completed';
    case 'has_description':
      return s.description && s.description.trim().length > 0 ? 'completed' : null;
    case 'equity_100': {
      const cents = Math.round(s.equitySum * 100);
      if (cents >= 10000) return 'completed';
      return cents > 0 ? 'in_progress' : null;
    }
    case 'has_partners':
      return s.membersCount > 1 ? 'completed' : null;
    case 'has_movement':
      return s.expensesCount >= 1 ? 'completed' : null;
    case 'has_recurring':
      return s.activeRecurringCount >= 1 ? 'completed' : null;
    case 'has_activities':
      return s.activitiesThisWeekCount >= 1 ? 'in_progress' : null;
    case 'has_logo':
      return s.logoUrl ? 'completed' : null;
    default:
      return null;
  }
}
