# Guia — deixar rodando no ar (automação + deploy)

O que já está configurado no projeto (só falta subir e ligar):

| Rotina | Quando roda | O que faz |
|---|---|---|
| **Coleta Praxio Incremental** | de hora em hora | atualiza tickets (novos + status) dos últimos 90 dias |
| **Recalcular SLA do Backlog** | 1x/dia (02:00 BRT) | recalcula o tempo útil dos tickets em aberto |
| **Coleta vpabx** | 1x/dia (03:00 BRT) | novas chamadas (lê o 2FA do e-mail sozinho) |

Backfills pesados (mensal, completa, histórico) ficam **manuais** (botão "Run workflow").

---

## Passo 1 — Subir o código pro GitHub

No **GitHub Desktop** (ou como você costuma):
1. Vai aparecer um monte de arquivo alterado (dashboards novos, coletores, workflows).
2. Escreva uma mensagem tipo "dashboards + telefonia + automação" e clique **Commit to master**.
3. Clique **Push origin**.

> Suas senhas NÃO vão junto — o `.env.local` está ignorado pelo git. ✔

---

## Passo 2 — Cadastrar os segredos no GitHub

No site do repositório: **Settings → Secrets and variables → Actions → New repository secret**.

Confira se estes já existem (do Praxio) e crie os que faltarem:
- `DATABASE_URL`
- `PORTAL_EMAIL`
- `PORTAL_SENHA`

E crie estes (novos, do vpabx / e-mail 2FA):
- `VPABX_PASS`  → senha de login do vpabx
- `IMAP_USER`   → felipe.dias@praxio.com.br
- `IMAP_PASS`   → senha do e-mail
- `IMAP_HOST`   → email-ssl.com.br
- `IMAP_PORT`   → 143
- `IMAP_SECURE` → false

(Os valores são os mesmos que você pôs no `.env.local`.)

---

## Passo 3 — Deixar o site no ar (Vercel)

Se o projeto **já está na Vercel**, o push do Passo 1 já dispara um novo deploy — é só esperar.

Se ainda não está:
1. Entre em vercel.com, **Add New → Project**, e importe o repositório `praxio-gerencial`.
2. Em **Environment Variables**, adicione: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (a URL do próprio site).
3. **Deploy**. Depois é só acessar a URL e entrar com seu login.

---

## Passo 4 — Conferir que está rodando

No GitHub, aba **Actions**: você verá os workflows. O "Coleta Praxio Incremental (de hora em hora)" roda sozinho no minuto 0 de cada hora. Dá pra forçar uma execução clicando no workflow → **Run workflow**.

---

## Aviso sobre minutos do GitHub Actions

Se o repositório for **privado**, o GitHub dá 2.000 minutos/mês grátis. A coleta de hora em hora consome cerca de 5 min/execução → ~3.600 min/mês, que passa do limite grátis.

Opções, se isso for um problema:
- Rodar a cada **2 horas** (corta pela metade) — me avise que eu troco.
- Deixar o repositório **público** (Actions fica ilimitado e grátis) — só se os dados/código puderem ser públicos.
- Assinar minutos extras no GitHub.

Se for público, ignore este aviso.
