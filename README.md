# Dashboard Gerencial Praxio

Métricas de desempenho dos consultores de suporte com coleta automática a cada 30 minutos via GitHub Actions.

## Funcionalidades

- **KPIs globais**: Total, Concluídos, Em Aberto, SLA%, TMA médio
- **Gráfico mensal**: Abertos vs. Concluídos (últimos 12 meses)
- **Ranking de consultores**: Concluídos, Média/mês, SLA (24h úteis), TMA
- **Drill-down por consultor**: Histórico + lista de tickets
- **Filtros**: Período, Grupo, Consultor

## SLA

- **Meta**: 24 horas úteis (seg–sex, 08h–18h BRT)
- **Critério**: Abertura → primeiro trâmite do consultor

## Setup Local

```bash
npm install
# Configurar .env.local com DATABASE_URL, PORTAL_EMAIL, PORTAL_SENHA
npx prisma db push
npm run dev
```

## Coleta Manual

```bash
npm run collect
# ou
npx tsx scripts/collect.ts
```

## Deploy

1. Push para GitHub (repositório público para Actions gratuito)
2. Configurar GitHub Secrets: `DATABASE_URL`, `PORTAL_EMAIL`, `PORTAL_SENHA`
3. Deploy Vercel: `npx vercel --prod`

O workflow `.github/workflows/collect.yml` roda automaticamente a cada 30 minutos.
