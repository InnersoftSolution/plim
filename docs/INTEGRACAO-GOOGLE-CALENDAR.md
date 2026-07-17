# Integração Google Calendar (Plim → Google, unidirecional)

Sincronização dos compromissos da Agenda do Plim para o Google Calendar pessoal
de cada participante que conectar a conta. **Unidirecional**: o Plim envia
eventos; nunca lê, importa ou exibe a agenda pessoal do usuário. Só Google
Calendar (sem Outlook, Apple, iCal, etc.).

A integração é **env-gated**: sem as variáveis de ambiente abaixo, a Agenda
funciona igual e o front mostra o card "Google Calendar em breve". Nada quebra.

---

## 1. O que foi entregue

**Banco (migração `supabase/migrations/0029_google_calendar.sql`):**
- `user_calendar_connections`: conexão OAuth por usuário, com tokens **cifrados**
  (AES-256-GCM). Só o service role escreve.
- `event_calendar_sync`: status da sincronização por evento e participante
  (`not_connected | pending | synced | failed | removed | disabled`), com o id
  do evento externo no Google para editar/remover depois.
- `events.sync_to_google`: flag por compromisso (default `false`).

**Backend:**
- Libs: `lib/crypto.ts` (cifra tokens + assina o `state`), `lib/google-oauth.ts`
  (fluxo OAuth), `lib/google-calendar.ts` (criar/editar/remover evento).
- `CalendarService`: conectar, callback, desconectar, status, token válido.
- `CalendarSyncService`: motor best-effort Plim → Google (criar/editar/cancelar
  + resync). Falha nunca derruba o evento no Plim (vira status `failed`).
- Rotas: `/calendar/google/connect`, `/calendar/google/callback`,
  `/calendar/google/disconnect`, `/me/calendar/google`,
  `/companies/:companyId/events/:eventId/sync` e `.../resync`.

**Frontend:** card de conexão na Agenda, aviso de privacidade, checkbox
"Sincronizar com Google Calendar dos participantes conectados" no formulário e
status por participante no detalhe do compromisso, com "Tentar novamente".

---

## 2. Variáveis de ambiente (Railway → serviço da API)

| Variável | O que é |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID do OAuth (tipo **Web application**) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret do mesmo cliente |
| `GOOGLE_OAUTH_REDIRECT_URI` | URL pública da API + `/calendar/google/callback` |
| `PLIM_WEB_ORIGIN` | Origem do app web (ex.: `https://app.plim.work`) |
| `CALENDAR_TOKEN_KEY` | Chave de 32 bytes que cifra os tokens (ver abaixo) |

Gerar a `CALENDAR_TOKEN_KEY` (base64 de 32 bytes):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Guarde essa chave. Se ela mudar, os tokens já cifrados no banco deixam de ser
lidos (cada usuário precisa reconectar).

---

## 3. Configuração no Google Cloud (só o Rafaelle faz)

Reaproveitando o cliente **Web application** já criado para o login com Google:

1. **APIs e serviços → Biblioteca:** ativar **Google Calendar API**.
2. **Tela de permissão OAuth → Escopos:** adicionar
   `https://www.googleapis.com/auth/calendar.events`. Esse escopo é sensível:
   o app roda para até ~100 **test users** enquanto não passa pela verificação
   do Google (leva semanas). Para produção aberta, enviar para verificação.
3. **Tela de permissão OAuth → Usuários de teste:** cadastrar os e-mails que vão
   testar (Rafaelle e sócias).
4. **Credenciais → cliente Web → URIs de redirecionamento autorizados:**
   adicionar exatamente o valor de `GOOGLE_OAUTH_REDIRECT_URI`
   (ex.: `https://SUA-API.up.railway.app/calendar/google/callback`).

Rodar a migração `0029` no **SQL Editor** do Supabase (é aditiva e idempotente).

---

## 4. Como conectar uma conta Google

1. Entrar no Plim → **Agenda**.
2. No card do topo, clicar **Conectar Google Calendar**.
3. Aprovar no consentimento do Google (a conta precisa estar na lista de test
   users enquanto o app não for verificado).
4. Volta para a Agenda com "Google Calendar conectado com sucesso".

---

## 5. Como testar

Todos os testes com o usuário conectado (passo 4).

**Criar evento:** novo compromisso → marcar **participantes** (incluindo você) →
marcar **"Sincronizar com Google Calendar dos participantes conectados"** →
Criar. Conferir que o evento aparece no seu Google Calendar. No detalhe do
compromisso, o status do participante fica **Sincronizado**.

**Editar:** abrir o compromisso, mudar horário/título → Salvar. O evento no
Google Calendar é atualizado.

**Cancelar:** excluir o compromisso (com a confirmação). O evento some do
Google Calendar.

**Participante sem Google conectado:** adicionar como participante alguém que
não conectou. O status dele fica **Google Calendar não conectado** e nada é
enviado para fora. O compromisso segue normal no Plim.

**Falha e resync:** se o Google recusar (token expirado, etc.), o status fica
**Falha ao sincronizar** com o botão **Tentar novamente**.

---

## 6. Limitações da primeira versão

- **Unidirecional**: eventos criados direto no Google Calendar não entram no
  Plim. O Plim nunca lê a agenda pessoal.
- **Sincronização inline best-effort**: roda junto com salvar o evento. Sem fila
  em background nem retry automático (o retry é manual, pelo botão).
- **"Cancelar" = excluir**: o Plim não guarda evento com status "cancelado"; ao
  excluir, remove do Google.
- Sem recorrência avançada, sem detecção de conflito, sem leitura de
  disponibilidade, sem convite externo complexo.
- Escopo sensível: só test users até a verificação do Google.
