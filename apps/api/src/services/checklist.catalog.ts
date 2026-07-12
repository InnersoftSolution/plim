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
    description: 'Definir um nome da identidade ao projeto e facilita dominio, marca e comunicacao.',
    phase: 'idea',
    priority: 'high',
    actionLabel: 'Editar nome',
    actionRoute: '/empresa/dados',
    autoRule: 'has_name',
  },
  {
    key: 'idea_description',
    title: 'Descricao da ideia',
    description: 'Uma descricao curta ajuda socios e parceiros a entenderem o que a empresa faz.',
    phase: 'idea',
    priority: 'high',
    actionLabel: 'Completar descricao',
    actionRoute: '/empresa/dados',
    autoRule: 'has_description',
  },
  {
    key: 'target_audience',
    title: 'Publico-alvo',
    description: 'Definir para quem a empresa existe ajuda em produto, preco, comunicacao e vendas.',
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
    description: 'Explique por que alguem escolheria a sua solucao em vez de outra.',
    phase: 'idea',
    priority: 'medium',
  },

  // Fase 2 - Marca e presenca
  {
    key: 'logo',
    title: 'Logo',
    description: 'A logo comeca a criar reconhecimento visual e deixa o ambiente do Plim mais personalizado.',
    phase: 'brand',
    priority: 'medium',
    actionLabel: 'Adicionar logo',
    actionRoute: '/empresa/dados',
    recommendedPartnerCategory: 'design',
    autoRule: 'has_logo',
  },
  {
    key: 'domain',
    title: 'Dominio',
    description: 'Registrar um dominio protege o nome e prepara site e e-mail profissional.',
    phase: 'brand',
    priority: 'medium',
    recommendedPartnerCategory: 'development',
  },
  {
    key: 'social_media',
    title: 'Redes sociais',
    description: 'Reservar as redes evita perder o nome e ajuda no lancamento.',
    phase: 'brand',
    priority: 'low',
  },
  {
    key: 'professional_email',
    title: 'E-mail profissional',
    description: 'Um e-mail profissional deixa a comunicacao mais confiavel para clientes e parceiros.',
    phase: 'brand',
    priority: 'low',
  },
  {
    key: 'landing_page',
    title: 'Site ou landing page',
    description: 'Uma pagina simples ja explica a ideia, capta interessados ou valida demanda.',
    phase: 'brand',
    priority: 'medium',
    recommendedPartnerCategory: 'development',
  },

  // Fase 3 - Sociedade e formalizacao
  {
    key: 'partners_registered',
    title: 'Socios cadastrados',
    description: 'Cadastrar socios organiza papeis, responsabilidades e futuros acertos.',
    phase: 'partnership',
    priority: 'high',
    actionLabel: 'Ver socios',
    actionRoute: '/socios',
    autoRule: 'has_partners',
  },
  {
    key: 'equity_defined',
    title: 'Participacao societaria definida',
    description: 'Definir os percentuais ajuda o Plim a calcular despesas compartilhadas e acertos.',
    phase: 'partnership',
    priority: 'high',
    actionLabel: 'Definir participacao',
    actionRoute: '/socios',
    autoRule: 'equity_100',
  },
  {
    key: 'partner_roles',
    title: 'Papel de cada socio',
    description: 'Registrar quem cuida de produto, tecnologia, financeiro ou marketing evita confusao.',
    phase: 'partnership',
    priority: 'medium',
    actionLabel: 'Ver socios',
    actionRoute: '/socios',
  },
  {
    key: 'founders_agreement',
    title: 'Acordo entre socios',
    description: 'Um acordo alinha responsabilidades, saida de socio, investimento e divisao.',
    phase: 'partnership',
    priority: 'medium',
    recommendedPartnerCategory: 'legal',
  },
  {
    key: 'legal_structure',
    title: 'Natureza juridica',
    description:
      'O tipo de empresa pode afetar impostos e obrigacoes. O Plim organiza a pendencia, mas talvez faca sentido conversar com um contador sobre as opcoes.',
    phase: 'partnership',
    priority: 'medium',
    actionLabel: 'Ver dados da empresa',
    actionRoute: '/empresa/dados',
    recommendedPartnerCategory: 'accounting',
  },

  // Fase 4 - Financeiro inicial
  {
    key: 'first_movement',
    title: 'Primeira movimentacao registrada',
    description: 'Registrar o primeiro gasto, aporte ou custo mostra quanto ja foi investido.',
    phase: 'finance',
    priority: 'high',
    actionLabel: 'Adicionar movimentacao',
    actionRoute: '/financeiro',
    autoRule: 'has_movement',
  },
  {
    key: 'recurring_costs',
    title: 'Custos recorrentes',
    description: 'Registrar os custos mensais ajuda a entender quanto custa manter a empresa.',
    phase: 'finance',
    priority: 'medium',
    actionLabel: 'Ver movimentacoes',
    actionRoute: '/financeiro',
    autoRule: 'has_recurring',
  },
  {
    key: 'business_bank_account',
    title: 'Conta bancaria da empresa',
    description: 'Separar a conta da empresa da conta pessoal ajuda na organizacao financeira.',
    phase: 'finance',
    priority: 'medium',
  },
  {
    key: 'pricing',
    title: 'Precificacao inicial',
    description: 'Definir preco ajuda a validar o modelo e organizar metas de venda.',
    phase: 'finance',
    priority: 'medium',
  },

  // Fase 5 - Produto, operacao e vendas
  {
    key: 'main_offer',
    title: 'Oferta principal',
    description: 'Definir o que a empresa vende organiza produto, comunicacao e preco.',
    phase: 'product',
    priority: 'medium',
  },
  {
    key: 'mvp',
    title: 'MVP ou primeira versao',
    description: 'Definir um MVP ajuda a comecar pequeno e testar rapido.',
    phase: 'product',
    priority: 'medium',
  },
  {
    key: 'sales_process',
    title: 'Processo de venda',
    description: 'Registrar como a empresa pretende vender organiza as acoes comerciais.',
    phase: 'product',
    priority: 'low',
  },
  {
    key: 'validation',
    title: 'Primeiros clientes ou validacao',
    description: 'Conversar com potenciais clientes valida se a ideia resolve uma dor real.',
    phase: 'product',
    priority: 'medium',
  },

  // Fase 6 - Rotina e acompanhamento
  {
    key: 'weekly_activities',
    title: 'Atividades da semana',
    description: 'Organizar as tarefas semanais ajuda os socios a saberem quem faz o que.',
    phase: 'routine',
    priority: 'medium',
    actionLabel: 'Criar atividade',
    actionRoute: '/atividades',
    autoRule: 'has_activities',
  },
  {
    key: 'weekly_meeting',
    title: 'Reuniao semanal',
    description: 'Uma conversa semanal ajuda os socios a acompanhar avancos, bloqueios e proximos passos.',
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
