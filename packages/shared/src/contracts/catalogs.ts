import { z } from 'zod';

/**
 * Catálogos da fundação (Fase 1). São sugestões/vocabulário compartilhado entre
 * front (exibe opções) e back (valida). Onde o spec permite "Outro", o campo
 * aceita texto livre — o back valida só o formato.
 */

/** Países iniciais + moeda padrão e rótulo dinâmico de região. */
export const countryCatalog = [
  { code: 'BR', label: 'Brasil', currencyCode: 'BRL', regionLabel: 'Estado' },
  { code: 'CA', label: 'Canadá', currencyCode: 'CAD', regionLabel: 'Província' },
  { code: 'OTHER', label: 'Outro', currencyCode: null, regionLabel: 'Região' },
] as const;
export type CountryCode = (typeof countryCatalog)[number]['code'];

/** Moedas suportadas no cadastro. */
export const currencyCatalog = [
  { code: 'BRL', label: 'Real brasileiro', symbol: 'R$' },
  { code: 'CAD', label: 'Dólar canadense', symbol: 'C$' },
  { code: 'USD', label: 'Dólar americano', symbol: 'US$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
] as const;
export type CurrencyCode = (typeof currencyCatalog)[number]['code'];

/** Estágio do negócio — exibido em cards no onboarding. */
export const businessStageCatalog = [
  { id: 'idea', label: 'Só tenho uma ideia', description: 'Ainda estou organizando o conceito.' },
  { id: 'validating', label: 'Estou validando', description: 'Conversando com pessoas, testando demanda ou montando uma primeira versão.' },
  { id: 'building', label: 'Estou construindo', description: 'Já comecei a criar o produto, serviço ou operação.' },
  { id: 'selling', label: 'Já comecei a vender', description: 'Já tenho clientes ou primeiras vendas.' },
  { id: 'formalized', label: 'Minha empresa já está formalizada', description: 'Já existe registro formal, como CNPJ ou equivalente.' },
] as const;
export const businessStageSchema = z.enum(['idea', 'validating', 'building', 'selling', 'formalized']);
export type BusinessStage = z.infer<typeof businessStageSchema>;

/** Tipo de negócio (business_model_type) — cards do onboarding. */
export const businessModelTypeCatalog = [
  { id: 'products', label: 'Venda de produtos', description: 'Você vende itens físicos ou digitais.' },
  { id: 'services', label: 'Prestação de serviços', description: 'Você oferece serviços para pessoas ou empresas.' },
  { id: 'technology', label: 'Tecnologia / SaaS / Aplicativo', description: 'Você está criando uma plataforma, software, app ou produto digital.' },
  { id: 'marketplace', label: 'Marketplace', description: 'Você conecta compradores e vendedores, clientes e profissionais ou oferta e demanda.' },
  { id: 'content_education', label: 'Conteúdo / Educação', description: 'Você cria cursos, mentorias, materiais ou comunidade.' },
  { id: 'unknown', label: 'Ainda não sei', description: 'Você ainda está entendendo o formato do negócio.' },
] as const;
export const businessModelTypeSchema = z.enum(['products', 'services', 'technology', 'marketplace', 'content_education', 'unknown']);
export type BusinessModelType = z.infer<typeof businessModelTypeSchema>;

/** Formalização: a empresa já tem registro formal (CNPJ ou equivalente)? */
export const hasFormalRegistrationCatalog = [
  { id: 'no', label: 'Ainda não formalizei', description: 'Estou começando e ainda preciso entender o melhor caminho.' },
  { id: 'yes', label: 'Já tenho CNPJ', description: 'Minha empresa já possui registro formal no Brasil.' },
  { id: 'foreign_or_other', label: 'Estou em outro país', description: 'Meu negócio será registrado fora do Brasil ou ainda estou avaliando.' },
  { id: 'unknown', label: 'Não sei o que escolher', description: 'Preciso entender melhor as opções antes de decidir.' },
] as const;
export const hasFormalRegistrationSchema = z.enum(['yes', 'no', 'unknown', 'foreign_or_other']);
export type HasFormalRegistration = z.infer<typeof hasFormalRegistrationSchema>;

/**
 * Natureza jurídica / caminho de formalização. Só os RÓTULOS vivem aqui;
 * o conteúdo explicativo (limites, regras, impostos) é CONFIGURÁVEL no banco
 * (guide_contents) porque muda com o tempo — nunca hardcoded (PRD §13/§20).
 */
export const legalStructureCatalog = [
  { id: 'unknown', label: 'Ainda não sei' },
  { id: 'mei', label: 'MEI' },
  { id: 'me', label: 'ME' },
  { id: 'simples', label: 'Simples Nacional' },
  { id: 'ltda', label: 'LTDA' },
  { id: 'slu', label: 'SLU' },
  { id: 'other', label: 'Outro' },
] as const;
export const legalStructureSchema = z.enum(['mei', 'me', 'simples', 'ltda', 'slu', 'other', 'unknown']);
export type LegalStructure = z.infer<typeof legalStructureSchema>;

/** Situação da decisão de natureza jurídica. */
export const legalStructureStatusSchema = z.enum(['defined', 'undecided', 'needs_accountant', 'not_applicable']);
export type LegalStructureStatus = z.infer<typeof legalStructureStatusSchema>;

/** Segmento principal (industry). "Outro" libera texto livre em industryOther. */
export const industryCatalog = [
  { id: 'tecnologia', label: 'Tecnologia' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'comercio', label: 'Comércio' },
  { id: 'saude', label: 'Saúde' },
  { id: 'educacao', label: 'Educação' },
  { id: 'alimentacao', label: 'Alimentação' },
  { id: 'marketing', label: 'Marketing e comunicação' },
  { id: 'moda-beleza', label: 'Moda e beleza' },
  { id: 'construcao', label: 'Construção' },
  { id: 'financas', label: 'Finanças' },
  { id: 'pets', label: 'Pets' },
  { id: 'artesanato', label: 'Artesanato' },
  { id: 'consultoria', label: 'Consultoria' },
  { id: 'outro', label: 'Outro' },
  { id: 'nao-sei', label: 'Ainda não sei' },
] as const;

/** Papel FUNCIONAL do sócio (o que a pessoa faz). Texto livre; catálogo é sugestão. */
export const functionalRoleCatalog = [
  'Fundador',
  'Cofundador',
  'Produto',
  'Tecnologia',
  'Financeiro',
  'Marketing',
  'Operações',
  'Comercial',
  'Jurídico',
  'Outro',
] as const;

/** Status do onboarding da empresa (save/resume). */
export const onboardingStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

/** Etapas do onboarding (para retomar de onde parou). */
export const onboardingStepSchema = z.enum([
  'basic',
  'business_type',
  'location',
  'stage',
  'members',
  'formalization',
  'legal_structure',
  'review',
]);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

/** Ciclo de vida do convite de um sócio (preparado para o futuro). */
export const invitationStatusSchema = z.enum([
  'not_invited',
  'invited',
  'accepted',
  'expired',
  'cancelled',
]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
