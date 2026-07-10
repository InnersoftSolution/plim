import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email('E-mail inválido');

export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa de pelo menos 8 caracteres')
  .regex(/[A-Za-z]/, 'Inclua pelo menos uma letra')
  .regex(/\d/, 'Inclua pelo menos um número');

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
