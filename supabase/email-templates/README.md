# E-mails de autenticação do plim

Templates dos e-mails que o Supabase envia (confirmação de cadastro,
redefinição de senha, magic link). Marca do plim, em português.

## 1. Conteúdo (grátis, imediato)

Supabase → **Authentication → Emails → Templates**. Para cada template, cole o
HTML correspondente e ajuste o **assunto**:

| Template do Supabase | Arquivo | Assunto sugerido |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirme seu e-mail e comece no plim |
| Reset Password | `reset-password.html` | Redefinir sua senha do plim |
| Magic Link | `magic-link.html` | Seu acesso ao plim |

> Só isso já troca o texto em inglês pelo visual do plim — mas o **remetente**
> continua `noreply@mail.app.supabase.io`. Para virar `@plim.work`, ver abaixo.

## 2. Remetente próprio + produção (SMTP via Resend)

O e-mail embutido do Supabase é só para testes (limite de poucos envios/hora).
Para produção **e** para o remetente ser do plim, conectar um SMTP próprio:

1. Criar conta em **resend.com** (grátis até 3.000/mês).
2. **Domains → Add Domain** → `plim.work`. O Resend mostra registros DNS
   (MX/TXT/DKIM) para adicionar na **GoDaddy** (mesmo lugar do domínio do app).
3. Após verificar, criar uma **API Key** no Resend.
4. Supabase → **Authentication → Emails → SMTP Settings** → habilitar custom SMTP:
   - Host: `smtp.resend.com`  ·  Port: `465`  ·  User: `resend`
   - Password: a API key do Resend
   - Sender name: `plim`  ·  Sender email: `oi@plim.work` (ou `nao-responda@plim.work`)
5. Enviar um teste (cadastro novo) e confirmar que chega como **plim**.
