# Guia passo a passo — coletor vpabx + backfill Praxio

Feito para seguir sem saber programar. Faça na ordem. Se algo der erro, copie a
mensagem e me mande.

---

## Parte 1 — Abrir o terminal na pasta do projeto

1. Abra o **Explorador de Arquivos** e entre na pasta:
   `C:\Users\Administrador\Downloads\praxio-gerencial`
2. Clique na **barra de endereço** (onde aparece o caminho), apague tudo, digite
   `powershell` e aperte **Enter**.
3. Vai abrir uma janela preta (o terminal) já dentro da pasta certa. É nela que
   você vai colar os comandos abaixo (copiar → botão direito cola).

---

## Parte 2 — Instalar o que o projeto precisa

Cole e aperte Enter (demora 1–2 min):

    npm install

Depois:

    npx playwright install chromium

---

## Parte 3 — Preencher as senhas (uma única vez)

1. Na pasta do projeto, abra o arquivo **`.env.local`** com o **Bloco de Notas**
   (clique direito → Abrir com → Bloco de Notas).
2. Ache estas duas linhas e cole as senhas entre as aspas:

    VPABX_PASS=""      -> senha de login do vpabx
    IMAP_PASS=""       -> senha do e-mail felipe.dias@praxio.com.br

   Ex.: `IMAP_PASS="suasenha"`
3. **Salve** (Ctrl+S) e feche.

> As outras linhas (host, usuário, porta) já vêm preenchidas. Não precisa mexer.

---

## Parte 4 — Criar a tabela de chamadas no banco

Cole no terminal:

    npx prisma db push

Deve terminar com algo como "Your database is now in sync".

---

## Parte 5 — Testar a coleta do vpabx (o teste principal)

Cole:

    npx tsx scripts/collect-vpabx.ts

O que deve acontecer:
- Ele faz login no vpabx.
- Se pedir o código 2FA, ele **lê o código do seu e-mail sozinho** e continua.
- Vai baixando mês a mês e mostrando linhas tipo `2026-06 atendida: 1487`.
- No fim: `Concluído! N chamadas gravadas`.

Se travar no login ou no 2FA, me mande o texto que apareceu — ajusto o seletor.

---

## Parte 6 — Rodar a importação completa do Praxio (backfill)

Isso popula TODOS os tickets, mês a mês. Cole (uma linha de cada vez):

    $env:MODO_COLETA="mensal"
    npx tsx scripts/collect.ts

Pode demorar bastante. No fim mostra o total.

---

## Parte 7 — Deixar rodando sozinho no GitHub (opcional, depois de testar)

1. No site do GitHub, abra o repositório → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret**.
2. Crie um secret para cada item (nome exato → valor):
   - `VPABX_PASS` → senha do vpabx
   - `IMAP_USER` → felipe.dias@praxio.com.br
   - `IMAP_PASS` → senha do e-mail
   - `IMAP_HOST` → email-ssl.com.br
   - `IMAP_PORT` → 143
   - `IMAP_SECURE` → false
   (Os secrets `DATABASE_URL`, `PORTAL_EMAIL`, `PORTAL_SENHA` já existem.)
3. Faça o **commit e push** das mudanças (pelo GitHub Desktop, botão "Commit"
   depois "Push", ou como você costuma subir).
4. No GitHub, aba **Actions**, os workflows novos aparecem:
   "Backfill Mensal", "Coleta vpabx". Dá pra rodar clicando em **Run workflow**.

---

Pronto. Comece pela Parte 1 e vá descendo. Qualquer erro, é só me mandar a
mensagem que aparece.
