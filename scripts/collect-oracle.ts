/**
 * Coleta de tickets via conexão direta ao Oracle (Praxio).
 *
 * Variáveis de ambiente necessárias:
 *   ORACLE_HOST     — IP ou hostname do servidor (ex: 192.168.1.100)
 *   ORACLE_PORT     — Porta Oracle (padrão: 1521)
 *   ORACLE_SERVICE  — Service Name ou SID (ex: PRAXIO ou XEPDB1)
 *   ORACLE_USER     — Usuário (consulta_sii)
 *   ORACLE_PASSWORD — Senha  (consulta_sii)
 *   MODO_ORACLE     — "discover" (lista tabelas) | "collect" (coleta tickets)
 *
 * Uso:
 *   npx tsx scripts/collect-oracle.ts           → coleta completa
 *   MODO_ORACLE=discover npx tsx scripts/collect-oracle.ts → lista tabelas
 */

import oracledb from 'oracledb';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { calcHorasUteis, getSlaStatus } from '../lib/business-hours.js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ── Configuração da conexão ────────────────────────────────────────────────────
const ORACLE_HOST     = process.env.ORACLE_HOST     ?? '';
const ORACLE_PORT     = process.env.ORACLE_PORT     ?? '1521';
const ORACLE_SERVICE  = process.env.ORACLE_SERVICE  ?? '';
const ORACLE_USER     = process.env.ORACLE_USER     ?? 'consulta_sii';
const ORACLE_PASSWORD = process.env.ORACLE_PASSWORD ?? 'consulta_sii';
const MODO            = process.env.MODO_ORACLE     ?? 'collect';

// IDs dos grupos Siga
const GRUPOS = [18, 28, 30, 31, 32];
const GROUP_ID_MAP: Record<number, string> = {
  18: 'Siga-i ADM', 28: 'Siga-i OPER',
  30: 'Siga Emissor', 31: 'Siga One - ADM', 32: 'Siga One - OPER',
};

const prisma = new PrismaClient();

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ── Modo descoberta: lista todas as tabelas acessíveis ─────────────────────────
async function discoverSchema(conn: oracledb.Connection) {
  log('🔍 Modo descoberta — listando tabelas acessíveis...');

  // Tabelas do usuário atual
  const { rows: tabelas } = await conn.execute<[string, number]>(
    `SELECT table_name, num_rows FROM user_tables ORDER BY table_name`,
    [], { outFormat: oracledb.OUT_FORMAT_ARRAY }
  );
  log(`\n📋 Tabelas disponíveis (${tabelas?.length ?? 0}):`);
  for (const [nome, linhas] of tabelas ?? []) {
    console.log(`  ${nome.padEnd(40)} ${linhas ?? '?'} linhas`);
  }

  // Tenta encontrar tabelas de tickets pelo nome
  const candidatos = (tabelas ?? [])
    .map(([nome]) => nome)
    .filter(n => /ticket|chamado|atend|tramite|suporte/i.test(n));

  if (candidatos.length > 0) {
    log(`\n🎯 Candidatos a tabela de tickets: ${candidatos.join(', ')}`);

    for (const tabela of candidatos.slice(0, 3)) {
      const { rows: cols } = await conn.execute<[string, string]>(
        `SELECT column_name, data_type FROM user_tab_columns WHERE table_name = :t ORDER BY column_id`,
        [tabela], { outFormat: oracledb.OUT_FORMAT_ARRAY }
      );
      log(`\n  Colunas de ${tabela}:`);
      for (const [col, tipo] of cols ?? []) {
        console.log(`    ${col.padEnd(35)} ${tipo}`);
      }
    }
  }
}

// ── Coleta de tickets ──────────────────────────────────────────────────────────
// ⚠️  Ajuste os nomes de tabela/coluna após rodar o modo discover
//     As colunas abaixo são suposições baseadas no export XLSX do portal.
//     Substitua por nomes reais após descobrir o schema.

const SQL_TICKETS = `
  SELECT
    t.PROTOCOLO,
    t.ASSUNTO,
    t.STATUS,
    t.ID_GRUPO_ATENDIMENTO   AS GRUPO_ID,
    t.CONSULTOR,
    t.MODULO,
    t.CLIENTE,
    t.DATA_ABERTURA          AS ABERTURA,
    t.DATA_CONCLUSAO         AS CONCLUSAO,
    t.DATA_ULTIMO_TRAMITE    AS ULTIMO_TRAMITE,
    (
      SELECT MIN(tr.DATA_TRAMITE)
      FROM   TB_TRAMITE tr
      WHERE  tr.ID_TICKET  = t.ID_TICKET
      AND    tr.TIPO       = 'ATENDIMENTO'
    )                        AS PRIMEIRO_TRAMITE
  FROM
    TB_TICKET t
  WHERE
    t.ID_GRUPO_ATENDIMENTO IN (${GRUPOS.join(',')})
  ORDER BY
    t.DATA_ABERTURA
`;
// TODO: Substituir TB_TICKET, TB_TRAMITE e nomes de colunas pelos reais
//       após executar o modo discover.

async function collectTickets(conn: oracledb.Connection) {
  log('📥 Consultando tickets no Oracle...');

  let rows: Record<string, any>[];
  try {
    const result = await conn.execute(SQL_TICKETS, [], {
      outFormat:  oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: 1000,
      maxRows: 0,      // sem limite
    });
    rows = (result.rows ?? []) as Record<string, any>[];
  } catch (err: any) {
    log(`❌ Erro na query. Execute MODO_ORACLE=discover primeiro para descobrir o schema.`);
    log(`   Erro: ${err.message}`);
    process.exit(1);
  }

  log(`   ${rows.length} tickets encontrados`);

  const coleta = await prisma.colecaoLog.create({ data: { status: 'em_andamento' } });
  let novos = 0;

  const cutoff = new Date(Date.now() - 72 * 3_600_000);

  for (const r of rows) {
    const protocolo = String(r.PROTOCOLO ?? '').trim();
    if (!protocolo) continue;

    const abertura = r.ABERTURA ? new Date(r.ABERTURA) : null;
    if (!abertura) continue;

    const grupoId   = Number(r.GRUPO_ID);
    const grupoNome = GROUP_ID_MAP[grupoId] ?? String(grupoId);
    const status    = String(r.STATUS ?? '').trim();
    const conclusao = r.CONCLUSAO ? new Date(r.CONCLUSAO) : null;
    const ultTram   = r.ULTIMO_TRAMITE ? new Date(r.ULTIMO_TRAMITE) : null;

    let primeirTramite = r.PRIMEIRO_TRAMITE ? new Date(r.PRIMEIRO_TRAMITE) : null;

    // Calcula SLA
    let slaStatus: string    = 'pendente';
    let slaHorasUteis: number | null = null;

    if (primeirTramite) {
      slaHorasUteis = calcHorasUteis(abertura, primeirTramite);
      slaStatus     = getSlaStatus(slaHorasUteis);
    } else if (abertura < cutoff && status !== 'Cancelado') {
      slaStatus     = 'fora';
      slaHorasUteis = calcHorasUteis(abertura, new Date());
    }

    const existing = await prisma.ticket.findUnique({
      where: { protocolo }, select: { protocolo: true },
    });

    await prisma.ticket.upsert({
      where:  { protocolo },
      create: {
        protocolo,
        assunto:       String(r.ASSUNTO   ?? '').trim(),
        status,
        grupo:         grupoNome,
        consultor:     String(r.CONSULTOR ?? '').trim(),
        modulo:        String(r.MODULO    ?? '').trim(),
        cliente:       String(r.CLIENTE   ?? '').trim(),
        abertura,
        primeirTramite,
        ultimoTramite: ultTram,
        conclusao,
        slaStatus,
        slaHorasUteis,
      },
      update: {
        status, conclusao, ultimoTramite: ultTram ?? undefined,
        primeirTramite: primeirTramite ?? undefined,
        slaStatus, slaHorasUteis: slaHorasUteis ?? undefined,
      },
    });

    if (!existing) novos++;
  }

  await prisma.colecaoLog.update({
    where: { id: coleta.id },
    data:  {
      concluidoEm: new Date(),
      status:      'concluido',
      ticketsNovos: novos,
      totalTickets: await prisma.ticket.count(),
    },
  });

  log(`✅ Concluído! ${novos} tickets novos, ${rows.length} processados.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!ORACLE_HOST || !ORACLE_SERVICE) {
    console.error(`
❌ Variáveis de conexão Oracle não configuradas.

Defina no .env.local ou como secrets do GitHub:
  ORACLE_HOST     = <IP ou hostname>
  ORACLE_PORT     = <porta, padrão 1521>
  ORACLE_SERVICE  = <Service Name ou SID>
  ORACLE_USER     = consulta_sii
  ORACLE_PASSWORD = consulta_sii
`);
    process.exit(1);
  }

  // Modo thin: não precisa de Oracle Instant Client instalado
  oracledb.initOracleClient(); // no-op em thin mode

  const connectString = `${ORACLE_HOST}:${ORACLE_PORT}/${ORACLE_SERVICE}`;
  log(`🔌 Conectando ao Oracle: ${connectString} (usuário: ${ORACLE_USER})`);

  let conn: oracledb.Connection;
  try {
    conn = await oracledb.getConnection({
      user:          ORACLE_USER,
      password:      ORACLE_PASSWORD,
      connectString,
    });
    log('   ✓ Conectado!');
  } catch (err: any) {
    log(`❌ Falha na conexão: ${err.message}`);
    process.exit(1);
  }

  try {
    if (MODO === 'discover') {
      await discoverSchema(conn);
    } else {
      await collectTickets(conn);
    }
  } finally {
    await conn.close();
    await prisma.$disconnect();
  }
}

main().catch(async err => {
  console.error('❌ Erro fatal:', err.message ?? err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
