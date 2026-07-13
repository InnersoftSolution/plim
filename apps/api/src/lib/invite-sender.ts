import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Porta de envio de convite para um sócio entrar no Plim.
 * A implementação real usa o Supabase Auth (inviteUserByEmail), que dispara
 * o template "Invite user" pelo SMTP já configurado (Resend, oi@plim.work).
 */
export interface InviteInput {
  email: string;
  fullName: string;
  companyName: string;
  inviterName: string;
}

/**
 * - 'sent': convite enviado, conta criada aguardando a pessoa definir a senha.
 * - 'already_registered': a pessoa já tem conta no Plim; o vínculo com a
 *   empresa acontece sozinho no próximo login (claim por e-mail).
 */
export type InviteResult = 'sent' | 'already_registered';

export interface InviteSender {
  sendInvite(input: InviteInput): Promise<InviteResult>;
}

export class SupabaseInviteSender implements InviteSender {
  constructor(private readonly db: SupabaseClient) {}

  async sendInvite(input: InviteInput): Promise<InviteResult> {
    const appUrl = process.env.APP_URL ?? 'https://app.plim.work';
    const { error } = await this.db.auth.admin.inviteUserByEmail(input.email, {
      // Vira user_metadata e alimenta o template ({{ .Data.company_name }}...).
      data: {
        full_name: input.fullName,
        company_name: input.companyName,
        inviter_name: input.inviterName,
      },
      redirectTo: `${appUrl}/auth/callback`,
    });
    if (error) {
      const already =
        error.status === 422 || /already.*(registered|exists)/i.test(error.message ?? '');
      if (already) return 'already_registered';
      throw new Error(`convite de sócio: ${error.message}`);
    }
    return 'sent';
  }
}

/** Dublê para dev/testes: registra os convites em memória. */
export class InMemoryInviteSender implements InviteSender {
  readonly sent: InviteInput[] = [];
  /** E-mails que devem se comportar como "já cadastrado". */
  readonly registered = new Set<string>();

  async sendInvite(input: InviteInput): Promise<InviteResult> {
    if (this.registered.has(input.email)) return 'already_registered';
    this.sent.push(input);
    return 'sent';
  }
}
