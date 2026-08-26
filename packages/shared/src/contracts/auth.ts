import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email('E-mail inválido');

/**
 * Régua de senha (endurecida em 26 ago 2026): 10+ caracteres com letra,
 * número e símbolo. Vale para cadastro e troca de senha; o login aceita
 * qualquer coisa, porque senha antiga ainda precisa entrar. A régua daqui
 * deve andar JUNTO com a configuração do Supabase Auth: o painel pode ser
 * mais frouxo que isto (o front barra antes), nunca mais rígido.
 */
export const passwordSchema = z
  .string()
  .min(10, 'A senha precisa de pelo menos 10 caracteres')
  .regex(/[A-Za-z]/, 'Inclua pelo menos uma letra')
  .regex(/\d/, 'Inclua pelo menos um número')
  .regex(/[^A-Za-z0-9]/, 'Inclua pelo menos um símbolo (ex.: ! @ # $)');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe sua senha'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Informe seu nome completo').max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
