import type { GuideContent } from '@plim/shared';

/**
 * Seed dos guias para o modo DEV/TESTE (in-memory). Em produção o conteúdo
 * vive na tabela guide_contents (migration 0007) e é editável sem deploy.
 * Tom: orientação inicial, nunca aconselhamento definitivo (PRD §20).
 */
export const guidesSeed: GuideContent[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    topic: 'legal_structure',
    key: 'mei',
    title: 'MEI — Microempreendedor Individual',
    short: 'O formato mais simples e barato para quem começa sozinho.',
    body: 'Pra quem: uma pessoa só, sem sócios, com faturamento pequeno (permite no máximo 1 funcionário).\nFaturamento: até cerca de R$ 81 mil por ano.\nAtenção: nem toda atividade pode ser MEI e não aceita sócios. Ao passar do limite, migra para ME. Confirme com um contador.',
    sortOrder: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    topic: 'legal_structure',
    key: 'me',
    title: 'ME — Microempresa',
    short: 'Para quem cresceu além do MEI ou tem atividade que o MEI não cobre.',
    body: 'Pra quem: negócios com faturamento maior que o teto do MEI ou atividades fora da lista do MEI. Pode ter sócios.\nFaturamento: até cerca de R$ 360 mil por ano.\nAtenção: exige contador e mais obrigações que o MEI. Confirme o enquadramento com um profissional.',
    sortOrder: 2,
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    topic: 'legal_structure',
    key: 'simples',
    title: 'Simples Nacional',
    short: 'Regime de impostos simplificado que reúne tributos numa guia só.',
    body: 'Pra quem: micro e pequenas empresas (ME/EPP) que se enquadram nos limites.\nFaturamento: até R$ 4,8 milhões por ano.\nAtenção: o Simples é um REGIME TRIBUTÁRIO (como pagar impostos), não um tipo de empresa — normalmente se combina com ME, LTDA ou SLU. Um contador confirma se compensa no seu caso.',
    sortOrder: 3,
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    topic: 'legal_structure',
    key: 'ltda',
    title: 'LTDA — Sociedade Limitada',
    short: 'O formato mais comum quando há sócios.',
    body: 'Pra quem: dois ou mais sócios; cada um responde pelo valor das suas cotas.\nFaturamento: sem teto fixo; o regime tributário vai conforme o porte.\nAtenção: o contrato social define as regras entre os sócios — vale caprichar nele. Confirme os detalhes com um contador.',
    sortOrder: 4,
  },
  {
    id: '00000000-0000-4000-8000-000000000105',
    topic: 'legal_structure',
    key: 'slu',
    title: 'SLU — Sociedade Limitada Unipessoal',
    short: 'Um dono só, com o patrimônio pessoal protegido.',
    body: 'Pra quem: quem empreende sozinho e quer separar os bens pessoais dos da empresa.\nFaturamento: sem teto fixo; regime tributário conforme o porte.\nAtenção: responsabilidade limitada ao capital da empresa — um bom padrão para quem está solo. Confirme com um contador.',
    sortOrder: 5,
  },
  {
    id: '00000000-0000-4000-8000-000000000106',
    topic: 'legal_structure',
    key: 'disclaimer',
    title: 'Antes de decidir',
    short: null,
    body: 'Este conteúdo é uma orientação inicial e não substitui um contador. A escolha do tipo de empresa depende de faturamento previsto, número de sócios e atividade — confirme com um profissional. O Plim pode indicar um parceiro para essa etapa.',
    sortOrder: 99,
  },
];
