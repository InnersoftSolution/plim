/**
 * Nucleo de orientacao do checklist (deterministico, R$0 de IA).
 *
 * Cada item do catalogo ganha o formato certo de registro, ali mesmo na tela:
 * - Itens de REGISTRO (dominio, redes sociais, e-mail, conta, reuniao...):
 *   campos estruturados que guardam a informacao para nao esquecer
 *   (ex: qual o dominio e onde foi registrado). Preencheu, concluiu.
 * - Itens de PENSAMENTO (publico-alvo, missao, visao, proposta de valor...):
 *   roteiro guiado com perguntas, exemplo pronto e campo de texto.
 *
 * No futuro, um botao "me ajude a escrever" pode chamar uma IA barata sob
 * demanda usando exatamente este mesmo painel, sem reescrever nada.
 */

export interface ChecklistField {
  key: string;
  label: string;
  placeholder: string;
  /** 'url' ganha atalho "abrir" quando preenchido. */
  type?: 'text' | 'url' | 'email';
}

export interface ChecklistForm {
  /** Frase curta que explica por que vale a pena preencher isso. */
  intro?: string;
  /** Perguntas que guiam o raciocinio (itens de pensamento). */
  questions?: string[];
  /** Exemplo pronto, usado como ponto de partida (nunca imposto). */
  example?: string;
  /** Campos estruturados (itens de registro). */
  fields?: ChecklistField[];
  /** Placeholder do campo de texto livre (quando nao ha campos). */
  notePlaceholder?: string;
}

export const checklistForms: Record<string, ChecklistForm> = {
  // ── Ideia e posicionamento (pensamento guiado) ─────────────────────
  target_audience: {
    intro:
      'Saber para quem a empresa existe deixa produto, preço, comunicação e vendas muito mais fáceis. Não precisa acertar de primeira, dá para refinar depois.',
    questions: [
      'Quem tem o problema que você resolve? Pense em idade, rotina e onde vive.',
      'Essa pessoa compra sozinha ou alguém decide por ela?',
      'Onde ela costuma buscar soluções hoje?',
      'O que ela mais valoriza na hora de escolher?',
    ],
    example:
      'Donos de pets de cidade grande, entre 25 e 45 anos, que tratam o animal como parte da família, compram online pela praticidade e valorizam produtos naturais e atendimento próximo.',
    notePlaceholder: 'Descreva quem é o seu público-alvo...',
  },
  problem_statement: {
    intro:
      'Toda empresa que dá certo resolve uma dor clara. Escrever essa dor em uma frase mantém o foco quando surgirem mil ideias novas.',
    questions: [
      'Qual situação incomoda o seu cliente hoje?',
      'Como ele resolve isso atualmente e por que é ruim?',
      'O que acontece se ele não resolver?',
    ],
    example:
      'Donos de pets querem produtos naturais de qualidade, mas perdem tempo pesquisando entre centenas de marcas e não confiam nos rótulos.',
    notePlaceholder: 'Descreva o problema que a empresa resolve...',
  },
  value_proposition: {
    intro:
      'A proposta de valor explica, em uma frase, por que alguém escolheria você em vez de qualquer outra opção. É o coração da sua comunicação.',
    questions: [
      'Que resultado concreto o cliente ganha com você?',
      'O que você faz melhor ou diferente dos outros?',
      'Por que confiar em você e não no concorrente?',
    ],
    example:
      'Ajudamos donos de pets ocupados a cuidar melhor do animal com produtos naturais entregues na porta de casa, com curadoria de quem entende do assunto e atendimento que lembra do nome do seu bicho.',
    notePlaceholder: 'Escreva a sua proposta de valor...',
  },
  mission: {
    intro:
      'A missão diz por que a empresa existe hoje e o que ela entrega para as pessoas. Serve de bússola para decisões do dia a dia.',
    questions: [
      'Que transformação você quer causar na vida do cliente?',
      'Para quem você faz isso?',
      'Como você faz de um jeito que é a sua cara?',
    ],
    example:
      'Tornar o cuidado com os pets mais simples e natural para famílias que amam seus animais, com produtos de qualidade e um atendimento humano.',
    notePlaceholder: 'Escreva a missão da empresa...',
  },
  vision: {
    intro:
      'A visão descreve aonde a empresa quer chegar no futuro. Ela inspira o time e mostra o tamanho do sonho, sem prazo rígido.',
    questions: [
      'Onde você quer que a empresa esteja em 3 a 5 anos?',
      'Como você quer ser lembrado pelos clientes?',
      'Qual seria o sinal de que deu certo?',
    ],
    example:
      'Ser a marca de referência em cuidado natural para pets no Brasil, presente na rotina de milhares de famílias que confiam na gente para o bem-estar do animal.',
    notePlaceholder: 'Escreva a visão da empresa...',
  },

  // ── Marca e presenca (registro estruturado) ────────────────────────
  domain: {
    intro: 'Registre onde está o domínio para ninguém esquecer onde renovar.',
    fields: [
      { key: 'url', label: 'Endereço do domínio', placeholder: 'ex: minhaempresa.com.br', type: 'url' },
      { key: 'registrar', label: 'Onde foi registrado', placeholder: 'ex: GoDaddy, Registro.br, Hostinger' },
      { key: 'renewal', label: 'Quando renova (opcional)', placeholder: 'ex: julho de cada ano' },
    ],
  },
  social_media: {
    intro: 'Guarde os links das redes para o time inteiro achar rápido.',
    fields: [
      { key: 'instagram', label: 'Instagram', placeholder: 'ex: instagram.com/minhaempresa', type: 'url' },
      { key: 'linkedin', label: 'LinkedIn', placeholder: 'ex: linkedin.com/company/minhaempresa', type: 'url' },
      { key: 'tiktok', label: 'TikTok', placeholder: 'ex: tiktok.com/@minhaempresa', type: 'url' },
      { key: 'other', label: 'Outra rede (opcional)', placeholder: 'ex: youtube.com/@minhaempresa', type: 'url' },
    ],
  },
  professional_email: {
    intro: 'Registre o e-mail oficial e onde ele foi criado.',
    fields: [
      { key: 'email', label: 'E-mail profissional', placeholder: 'ex: contato@minhaempresa.com.br', type: 'email' },
      { key: 'provider', label: 'Onde foi criado', placeholder: 'ex: Google Workspace, Zoho Mail' },
    ],
  },
  landing_page: {
    intro: 'Guarde o link do site e onde ele está hospedado.',
    fields: [
      { key: 'url', label: 'Link do site', placeholder: 'ex: minhaempresa.com.br', type: 'url' },
      { key: 'host', label: 'Onde está hospedado', placeholder: 'ex: Vercel, Wix, Hostinger' },
    ],
  },

  // ── Sociedade e formalizacao ───────────────────────────────────────
  partner_roles: {
    intro:
      'Deixar claro quem cuida do quê evita retrabalho e conflito. Não precisa ser rígido, é um combinado inicial.',
    questions: [
      'Quem cuida de produto e operação?',
      'Quem cuida de vendas e marketing?',
      'Quem cuida do financeiro e da parte legal?',
    ],
    example: 'Rafaelle: produto e marketing. Vanessa: financeiro e operação. Decisões grandes: sempre juntas.',
    notePlaceholder: 'Descreva o papel de cada sócio...',
  },
  founders_agreement: {
    intro: 'Guarde onde está o documento e em que pé ele anda.',
    fields: [
      { key: 'doc', label: 'Link do documento', placeholder: 'ex: link do Google Drive ou Notion', type: 'url' },
      { key: 'status', label: 'Situação', placeholder: 'ex: rascunho em revisão com os sócios' },
    ],
  },
  legal_structure: {
    notePlaceholder: 'ex: MEI por enquanto, avaliando ME com o contador...',
  },

  // ── Financeiro inicial ─────────────────────────────────────────────
  business_bank_account: {
    intro: 'Registre onde está a conta da empresa.',
    fields: [
      { key: 'bank', label: 'Banco e tipo de conta', placeholder: 'ex: Conta PJ no Inter' },
      { key: 'obs', label: 'Observações (opcional)', placeholder: 'ex: aberta em julho de 2026, cartão a caminho' },
    ],
  },
  pricing: {
    intro:
      'Um preço inicial não precisa ser perfeito, precisa existir. Com ele você valida o modelo e ajusta com dados reais.',
    questions: [
      'Quanto custa entregar seu produto ou serviço (materiais, tempo, taxas)?',
      'Quanto os concorrentes cobram por algo parecido?',
      'Que margem você precisa para o negócio se sustentar?',
    ],
    example:
      'Kit inicial a R$ 89: custo de R$ 41, margem de 54%. Concorrentes cobram de R$ 79 a R$ 120. Revisão do preço a cada 3 meses.',
    notePlaceholder: 'Descreva sua precificação inicial...',
  },

  // ── Produto, operacao e vendas ─────────────────────────────────────
  main_offer: {
    intro: 'Definir a oferta principal organiza produto, comunicação e preço em torno de uma coisa só.',
    questions: [
      'O que exatamente a empresa vende (produto, serviço, assinatura)?',
      'O que está incluído e o que fica de fora?',
      'Qual é o formato de entrega?',
    ],
    example:
      'Assinatura mensal de caixa de petiscos naturais, com 6 itens selecionados por veterinária, entrega em casa e guia de uso.',
    notePlaceholder: 'Descreva a oferta principal...',
  },
  mvp: {
    intro:
      'O MVP é a menor versão que já entrega valor. Começar pequeno deixa você testar rápido e errar barato.',
    questions: [
      'Qual é a versão mais simples que já resolve o problema?',
      'O que dá para cortar sem perder a essência?',
      'Em quanto tempo você consegue colocar isso na rua?',
    ],
    example:
      'Vender 20 caixas montadas à mão para conhecidos, com pedido por WhatsApp e pagamento por Pix, antes de investir em site e estoque.',
    notePlaceholder: 'Descreva o MVP ou a primeira versão...',
  },
  sales_process: {
    intro: 'Saber como a venda acontece, do primeiro contato ao pagamento, organiza as ações comerciais.',
    questions: [
      'Onde o cliente descobre você?',
      'Como ele pede e como paga?',
      'Quem atende e em quanto tempo?',
    ],
    example:
      'Cliente chega pelo Instagram, pede pelo WhatsApp, paga por Pix ou cartão e recebe em até 3 dias úteis. Atendimento: Rafaelle, em horário comercial.',
    notePlaceholder: 'Descreva como a empresa vende...',
  },
  validation: {
    intro:
      'Conversar com clientes de verdade é o jeito mais barato de descobrir se a ideia resolve uma dor real.',
    questions: [
      'Com quantas pessoas do público-alvo você já conversou?',
      'O que elas disseram que confirmou (ou mudou) a ideia?',
      'Alguém já pagou ou se comprometeu a pagar?',
    ],
    example:
      'Conversei com 12 donos de pets: 9 reclamaram de rótulos confusos, 5 toparam testar a caixa e 3 já pagaram a primeira.',
    notePlaceholder: 'Registre o que aprendeu com clientes...',
  },

  // ── Rotina e acompanhamento ────────────────────────────────────────
  weekly_meeting: {
    intro: 'Combine o ritual e registre aqui para virar rotina.',
    fields: [
      { key: 'schedule', label: 'Dia e horário', placeholder: 'ex: segundas, 9h' },
      { key: 'place', label: 'Onde acontece', placeholder: 'ex: Google Meet, presencial no escritório' },
    ],
  },
};

export function formFor(templateKey: string | null): ChecklistForm | null {
  if (!templateKey) return null;
  return checklistForms[templateKey] ?? null;
}

/** Prefixa https:// quando o usuario digitou o link sem protocolo. */
export function hrefFor(value: string): string {
  const v = value.trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
