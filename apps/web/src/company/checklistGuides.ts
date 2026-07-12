/**
 * Guias de orientacao dos itens de conteudo do checklist.
 *
 * Nucleo deterministico (R$0 de IA): para cada item de posicionamento, o Plim
 * abre um roteiro com o porque, perguntas que ajudam a pensar e um exemplo
 * pronto que o usuario pode usar como ponto de partida. O resultado e salvo na
 * anotacao do item, ali mesmo, sem trocar de pagina.
 *
 * No futuro, um botao "me ajude a escrever" pode chamar uma IA barata sob
 * demanda usando exatamente este mesmo painel, sem reescrever nada.
 */
export interface ChecklistGuide {
  /** Frase curta que explica por que vale a pena preencher isso. */
  intro: string;
  /** Perguntas que guiam o raciocinio do usuario. */
  questions: string[];
  /** Exemplo pronto, usado como ponto de partida (nunca imposto). */
  example: string;
  /** Placeholder do campo de escrita. */
  placeholder: string;
}

export const checklistGuides: Record<string, ChecklistGuide> = {
  target_audience: {
    intro:
      'Saber para quem a empresa existe deixa produto, preco, comunicacao e vendas muito mais faceis. Nao precisa acertar de primeira, dá para refinar depois.',
    questions: [
      'Quem tem o problema que voce resolve? Pense em idade, rotina e onde vive.',
      'Essa pessoa compra sozinha ou alguem decide por ela?',
      'Onde ela costuma buscar solucoes hoje?',
      'O que ela mais valoriza na hora de escolher?',
    ],
    example:
      'Donos de pets de cidade grande, entre 25 e 45 anos, que tratam o animal como parte da familia, compram online pela praticidade e valorizam produtos naturais e atendimento proximo.',
    placeholder: 'Descreva quem é o seu público-alvo...',
  },
  value_proposition: {
    intro:
      'A proposta de valor explica, em uma frase, por que alguém escolheria voce em vez de qualquer outra opcao. É o coracao da sua comunicacao.',
    questions: [
      'Que resultado concreto o cliente ganha com voce?',
      'O que voce faz melhor ou diferente dos outros?',
      'Por que confiar em voce e nao no concorrente?',
    ],
    example:
      'Ajudamos donos de pets ocupados a cuidar melhor do animal com produtos naturais entregues na porta de casa, com curadoria de quem entende do assunto e atendimento que lembra do nome do seu bicho.',
    placeholder: 'Escreva a sua proposta de valor...',
  },
  mission: {
    intro:
      'A missao diz por que a empresa existe hoje e o que ela entrega para as pessoas. Serve de bússola para decisoes do dia a dia.',
    questions: [
      'Que transformacao voce quer causar na vida do cliente?',
      'Para quem voce faz isso?',
      'Como voce faz de um jeito que é a sua cara?',
    ],
    example:
      'Tornar o cuidado com os pets mais simples e natural para famílias que amam seus animais, com produtos de qualidade e um atendimento humano.',
    placeholder: 'Escreva a missão da empresa...',
  },
  vision: {
    intro:
      'A visao descreve aonde a empresa quer chegar no futuro. Ela inspira o time e mostra o tamanho do sonho, sem prazo rígido.',
    questions: [
      'Onde voce quer que a empresa esteja em 3 a 5 anos?',
      'Como voce quer ser lembrado pelos clientes?',
      'Qual seria o sinal de que deu certo?',
    ],
    example:
      'Ser a marca de referência em cuidado natural para pets no Brasil, presente na rotina de milhares de famílias que confiam na gente para o bem-estar do animal.',
    placeholder: 'Escreva a visão da empresa...',
  },
};

export function guideFor(templateKey: string | null): ChecklistGuide | null {
  if (!templateKey) return null;
  return checklistGuides[templateKey] ?? null;
}
