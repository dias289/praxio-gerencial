/**
 * Script de coleta automática de dados do portal Praxio.
 *
 * Executado via GitHub Actions a cada 30 minutos.
 * Pode ser chamado localmente: npx tsx scripts/collect.ts
 *
 * Fluxo:
 * 1. Export XLSX → lista completa dos 5 grupos
 * 2. Identifica tickets novos ou sem SLA calculado
 * 3. Para cada ticket novo: acessa detalhe → lê 1º trâmite do consultor
 * 4. Calcula SLA em horas úteis
 * 5. Upsert no Neon Postgres
 */

import { chromium, type Page } from 'playwright';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getSlaStatus } from '../lib/business-hours.js';
import { calcSlaTempoUtil, buildRoster, type Tramite, type Roster } from '../lib/sla-tempo-util.js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const BASE   = 'https://portaldocliente.praxio.com.br';
const EMAIL  = process.env.PORTAL_EMAIL ?? '';
const SENHA  = process.env.PORTAL_SENHA  ?? '';

const GROUP_ID_MAP: Record<string, string> = {
  '18': 'Siga-i ADM',  '28': 'Siga-i OPER',
  '30': 'Siga Emissor','31': 'Siga One - ADM','32': 'Siga One - OPER',
};

// GRUPO_ID: quando definido, coleta apenas esse grupo (ex: "18").
// Permite rodar 5 jobs em paralelo no GitHub Actions, cada um para um grupo.
const GRUPO_ID = process.env.GRUPO_ID ?? '';  // '' = todos os grupos

// SQL base filtrado pelo(s) grupo(s) alvo
const GROUP_SQL = GRUPO_ID
  ? `([IdGrupoAtendimento] = ${GRUPO_ID})`
  : `([IdGrupoAtendimento] In (18, 28, 30, 31, 32))`;

// Janela para buscar SLA: tickets abertos nas últimas 72h que ainda não têm 1º trâmite
const SLA_WINDOW_HOURS = 72;

// Meta de SLA em horas úteis (tempo útil sob o time) — usada só para o rótulo dentro/fora
const META_SLA = Number(process.env.META_SLA_HORAS ?? 24);

// SLA (tempo útil) só é calculado para tickets em aberto + concluídos nos últimos N dias.
// Concluídos antigos guardam metadados (volume/tendência) sem o SLA pesado — evita
// buscar o histórico de 100k+ tickets num backfill completo.
const SLA_LOOKBACK_DIAS = Number(process.env.SLA_LOOKBACK_DIAS ?? 30);

// Modo de coleta:
//   incremental  = tickets abertos nos últimos ~90 dias — rápido, para o cron
//   historico    = usa filtro customSearchMenu=29221 ("Tickets 2025-2026") — 1 export
//   completa     = todos os tickets históricos por grupo — lento, sem filtro de data
//   mensal       = importação COMPLETA e confiável: exporta mês a mês (evita o limite
//                  de export do portal), varrendo todo o período. Método recomendado
//                  para backfill — captura TODOS os tickets, sem truncar.
const MODO = (process.env.MODO_COLETA ?? 'incremental') as 'incremental' | 'historico' | 'completa' | 'mensal';

// IDs das pesquisas salvas no portal (descobertos via XHR interception)
const SEARCH_ID = {
  bypass:     29180,  // bypass original — todos os tickets sem filtro de data
  todosStatus: 29221, // "Tickets concluídos / abertos / em andamento / pendente"
};

function getSqlFiltro(): string {
  if (MODO === 'completa' || MODO === 'historico' || MODO === 'mensal') return GROUP_SQL;
  // Janela por DATA DE ABERTURA (coluna DataHoraAbertura — a mesma do mensal, que
  // exporta rápido). 90 dias cobrem todo o backlog ativo e os tickets novos; o export
  // por [DataHoraTramite] travava no servidor, por isso ficamos só na abertura.
  const dias = Number(process.env.INCREMENTAL_DIAS ?? 90);
  const cutoff = new Date(Date.now() - dias * 24 * 3_600_000);
  const d = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;
  return `${GROUP_SQL} And [DataHoraAbertura] >= #${d}#`;
}

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function waitIdle(page: Page) {
  await page.waitForFunction(() => {
    const w = window as any;
    if (!w.grdTicket) return false;
    try { return !w.grdTicket.InCallback?.(); } catch { return true; }
  }, { timeout: 25_000, polling: 300 }).catch(() => {});
}

function parsePortalDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === '01/01/0001 00:00:00') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, dd, MM, yyyy, hh = '0', mm = '0', ss = '0'] = m;
  const d = new Date(parseInt(yyyy), parseInt(MM) - 1, parseInt(dd),
                     parseInt(hh), parseInt(mm), parseInt(ss));
  return isNaN(d.getTime()) ? null : d;
}

function parseXlsxBuffer(buf: Buffer): Record<string, string>[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (rows.length < 2) return [];
  const headers = (rows[0] as string[]).map(h => String(h ?? '').trim());
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) obj[h] = String((row as any[])[i] ?? '').trim(); });
    return obj;
  });
}

// ── Extrai data do PRIMEIRO trâmite do consultor no detalhe do ticket ─────────
async function fetchFirstTramite(page: Page, ticketId: string): Promise<Date | null> {
  try {
    await page.goto(`${BASE}/Ticket/TicketPrincipal/${ticketId}`, {
      waitUntil: 'domcontentloaded', timeout: 20_000,
    });
    await page.waitForTimeout(1000);

    // Busca o primeiro trâmite no histórico (ordem cronológica ascendente)
    const firstDate: string | null = await page.evaluate(() => {
      // O histórico é renderizado em ordem decrescente (mais recente primeiro)
      // Precisamos do ÚLTIMO item na lista = mais antigo = 1º trâmite
      const timeEls = Array.from(document.querySelectorAll('#historicoTramites .time, .time'));
      if (!timeEls.length) return null;
      // Busca o formato de data nos elementos
      for (let i = timeEls.length - 1; i >= 0; i--) {
        const txt = timeEls[i].textContent?.trim() ?? '';
        if (/\d{2}\/\d{2}\/\d{4}/.test(txt)) return txt;
      }
      return null;
    });

    return firstDate ? parsePortalDate(firstDate) : null;
  } catch {
    return null;
  }
}

// ── Extrai o histórico completo de trâmites (status + assumido/transferido) ────
async function fetchTicketHistory(page: Page, ticketId: string): Promise<Tramite[]> {
  try {
    await page.goto(`${BASE}/Ticket/TicketPrincipal/${ticketId}`, {
      waitUntil: 'domcontentloaded', timeout: 20_000,
    });
    await page.waitForTimeout(800);

    const evs = await page.evaluate(() => {
      const STS = 'Ticket aberto|Em andamento|Pendente cliente|Aguardando adequação|Cancelado|Concluído|Reaberto';
      const reS = new RegExp('Status:\\s*(' + STS + ')', 'i');
      const items = Array.from(document.querySelectorAll('.itemdiv.dialogdiv'));
      const out: { ts: number; status: string | null; assumido: string | null; transfPara: string | null }[] = [];
      for (const it of items) {
        const txt = (it.textContent || '').replace(/\s+/g, ' ').trim();
        const tm = txt.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if (!tm) continue;
        // horário BRT do portal codificado como UTC (consistente com o cálculo de horas úteis)
        const ts = Date.UTC(+tm[3], +tm[2] - 1, +tm[1], +tm[4], +tm[5]);
        let status: string | null = null;
        const sm = txt.match(reS); if (sm) status = sm[1];
        let assumido: string | null = null, transfPara: string | null = null;
        const am = txt.match(/assumido por ([A-Z0-9_.]+)/i); if (am) assumido = am[1].replace(/\.+$/, '');
        const trm = txt.match(/transferido de ([A-Z0-9_.]+)\s+para\s+([A-Z0-9_.]+)/i); if (trm) transfPara = trm[2].replace(/\.+$/, '');
        out.push({ ts, status, assumido, transfPara });
      }
      out.sort((a, b) => a.ts - b.ts);
      return out;
    });
    return evs as Tramite[];
  } catch {
    return [];
  }
}

// ── Export XLSX do portal ─────────────────────────────────────────────────────
async function downloadXlsx(page: Page, ctx: any, status: string): Promise<Buffer | null> {
  const exportUrl: string = await page.evaluate(() => {
    const w = window as any;
    const c = w.MontarConfigsGrid?.() ?? '';
    const o = w.MontarOrdemGrid?.()   ?? '[]';
    return `/Ticket/ExportTo?tipo=2&configsGrid=${encodeURIComponent(c)}&ordemGrid=${encodeURIComponent(o)}`;
  });
  const resp = await ctx.request.get(`${BASE}${exportUrl}`, {
    timeout: 120_000, headers: { Referer: `${BASE}/Ticket` },
  }).catch(() => null);
  if (!resp || !resp.ok()) return null;
  const body = await resp.body();
  return (body[0] === 0x50 && body[1] === 0x4b) ? body : null;
}

async function setFilter(page: Page, col: number, val: string) {
  await page.evaluate(({ c, v }: { c: number; v: string }) => {
    const w = window as any;
    const ed = w[`grdTicket_DXFREditorcol${c}`];
    ed?.SetText?.(v);
    w.ASPx?.GVFilterChanged?.('grdTicket', ed);
  }, { c: col, v: val });
  await waitIdle(page);
  await page.waitForTimeout(800);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!EMAIL || !SENHA) {
    log('❌ PORTAL_EMAIL e PORTAL_SENHA não configurados'); process.exit(1);
  }

  log('🚀 Iniciando coleta...');

  // Registra início da coleta
  const coleta = await prisma.colecaoLog.create({ data: { status: 'em_andamento' } });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });

  let ticketsNovos = 0;
  let ticketsSla   = 0;

  try {
    const ctx  = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
    const page = await ctx.newPage();

    // ── Login ─────────────────────────────────────────────────────────────
    log('🔑 Login no portal...');
    await page.goto(`${BASE}/Home/Index`, { waitUntil: 'domcontentloaded' });
    await page.fill('[name=txtLogin]', EMAIL);
    await page.fill('[name=txtSenha]', SENHA);
    await Promise.all([
      page.waitForURL(u => u.toString().includes('/Ticket'), { timeout: 30_000 }),
      page.click('button[type=submit]'),
    ]);
    await page.waitForSelector('#grdTicket', { timeout: 30_000 });
    await waitIdle(page);
    log('   ✓ Login OK');

    log(`🔧 Modo: ${MODO}${GRUPO_ID ? ` | Grupo: ${GRUPO_ID}` : ''}`);

    // ── Escolhe a pesquisa salva conforme o modo ───────────────────────────
    const searchId = MODO === 'historico' ? SEARCH_ID.todosStatus : SEARCH_ID.bypass;
    await page.goto(`${BASE}/Ticket?customSearchMenu=${searchId}`, { waitUntil: 'networkidle', timeout: 30_000 });
    await waitIdle(page);
    await page.waitForTimeout(500);

    const sqlFiltro = getSqlFiltro();
    await page.evaluate((sql: string) => {
      (window as any).grdTicket?.ApplyFilter?.(sql);
    }, sqlFiltro);
    await waitIdle(page);
    await page.waitForTimeout(800);

    // ── Exporta tickets ────────────────────────────────────────────────────
    const allRows: Record<string, string>[] = [];

    if (MODO === 'historico') {
      // Modo histórico: filtro 29221 já tem todos os status de 2025-2026
      // Exporta tudo de uma vez (dataset menor = sem risco de timeout 50k)
      log('   Exportando todos os status (filtro 2025-2026)...');
      const buf = await downloadXlsx(page, ctx, 'todos');
      if (buf) { const rows = parseXlsxBuffer(buf); allRows.push(...rows); log(`   Total: ${rows.length}`); }

    } else if (MODO === 'incremental') {
      // Um único export com o filtro de atividade recente (getSqlFiltro já foi aplicado
      // na configuração comum acima) — traz TODOS os status de uma vez. Mesmo caminho
      // confiável do mensal (ApplyFilter + downloadXlsx), sem o setFilter frágil.
      // Captura novos, alterados e concluídos recentes numa tacada só.
      const buf = await downloadXlsx(page, ctx, 'incremental');
      if (buf) { const rows = parseXlsxBuffer(buf); allRows.push(...rows); log(`   Recentes (7 dias): ${rows.length}`); }

    } else if (MODO === 'mensal') {
      // ── Importação COMPLETA e confiável: exporta MÊS A MÊS ─────────────────
      // Cada mês é um dataset pequeno (não estoura o limite de export do portal),
      // com o filtro validado (grupo + DataHoraAbertura no intervalo do mês).
      // Varre do mês atual para trás e para sozinho após 3 meses vazios.
      const inicio = process.env.COLETA_INICIO ?? '2022-01'; // piso YYYY-MM
      const now = new Date();
      let yy = now.getUTCFullYear(), mm = now.getUTCMonth() + 1;
      let vazios = 0;
      for (let k = 0; k < 120; k++) {
        const a = `${yy}-${String(mm).padStart(2, '0')}-01`;
        const nyy = mm === 12 ? yy + 1 : yy, nmm = mm === 12 ? 1 : mm + 1;
        const b = `${nyy}-${String(nmm).padStart(2, '0')}-01`;
        const sqlMes = `${GROUP_SQL} And [DataHoraAbertura] >= #${a}# And [DataHoraAbertura] < #${b}#`;
        await page.evaluate((s: string) => { (window as any).grdTicket?.ApplyFilter?.(s); }, sqlMes);
        await waitIdle(page);
        await page.waitForTimeout(700);
        const buf = await downloadXlsx(page, ctx, a);
        const rows = buf ? parseXlsxBuffer(buf) : [];
        allRows.push(...rows);
        log(`   ${a}: ${rows.length}`);
        if (rows.length === 0) { if (++vazios >= 3) break; } else vazios = 0;
        mm--; if (mm < 1) { mm = 12; yy--; }
        if (`${yy}-${String(mm).padStart(2, '0')}` < inicio) break;
      }

    } else {
      // Completa: por status e por grupo (dataset grande, sem filtro de data)
      for (const status of ['Em andamento', 'Pendente cliente', 'Cancelado']) {
        await setFilter(page, 4, status);
        const buf = await downloadXlsx(page, ctx, status);
        if (buf) { const rows = parseXlsxBuffer(buf); allRows.push(...rows); log(`   ${status}: ${rows.length}`); }
      }
      await page.goto(`${BASE}/Ticket?customSearchMenu=${searchId}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await waitIdle(page);
      await page.waitForTimeout(500);
      await page.evaluate((sql: string) => { (window as any).grdTicket?.ApplyFilter?.(sql); }, sqlFiltro);
      await waitIdle(page);
      await page.waitForTimeout(800);
      await setFilter(page, 4, 'Concluído');
      const grupos = GRUPO_ID ? [GROUP_ID_MAP[GRUPO_ID]].filter(Boolean) : Object.values(GROUP_ID_MAP);
      for (const groupName of grupos) {
        await setFilter(page, 19, groupName);
        const buf = await downloadXlsx(page, ctx, 'Concluído');
        if (buf) { const rows = parseXlsxBuffer(buf); allRows.push(...rows); log(`   Concluído ${groupName}: ${rows.length}`); }
      }
      await setFilter(page, 19, '');
      await setFilter(page, 4, '');
    }

    log(`   Total bruto: ${allRows.length} linhas`);

    // ── Roster de times (grupo -> membros) a partir do histórico + export atual ─
    const dbRows = await prisma.ticket.findMany({ select: { grupo: true, consultor: true } });
    const exportRows = allRows.map(r => ({
      grupo: GROUP_ID_MAP[String(r['Grupo de Atendimento'] ?? '').trim()] ?? String(r['Grupo de Atendimento'] ?? '').trim(),
      consultor: String(r['Responsável'] ?? '').trim(),
    }));
    const roster: Roster = buildRoster([...dbRows, ...exportRows], 20);
    log(`   Roster: ${Object.keys(roster).length} grupos`);

    // ── Processa e salva ──────────────────────────────────────────────────
    const seen = new Set<string>();

    for (const r of allRows) {
      const protocolo = String(r['Nº ticket'] ?? r['Protocolo'] ?? '').replace(/\s/g,'').trim();
      if (!protocolo || seen.has(protocolo)) continue;
      seen.add(protocolo);

      const abertura  = parsePortalDate(r['Data / Hora abertura']);
      if (!abertura) continue;

      const grupoId   = String(r['Grupo de Atendimento'] ?? '').trim();
      const grupoNome = GROUP_ID_MAP[grupoId] ?? grupoId;
      const status    = String(r['Status'] ?? '').trim();
      const conclusao = parsePortalDate(r['Data de conclusão']);
      const ultTram   = parsePortalDate(r['Último trâmite']);

      // ── SLA "tempo útil sob o time" ─────────────────────────────────────
      const existing = await prisma.ticket.findUnique({
        where: { protocolo },
        select: { slaHorasUteis: true, slaStatus: true, primeirTramite: true, ultimoTramite: true },
      });

      let slaHorasUteis: number | null = existing?.slaHorasUteis ?? null;
      let slaStatus      = existing?.slaStatus ?? 'pendente';
      let primeirTramite = existing?.primeirTramite ?? null;

      // Só há atividade nova se o "Último trâmite" mudou desde a última coleta
      const mudou = !!(existing && ultTram && existing.ultimoTramite &&
                       ultTram.getTime() !== existing.ultimoTramite.getTime());
      // SLA só para tickets em aberto ou concluídos recentemente (janela de lookback).
      // Concluídos antigos ficam sem SLA (só metadados) — mantém o backfill viável.
      const aberto = status !== 'Concluído' && status !== 'Cancelado';
      const janelaSla = Date.now() - SLA_LOOKBACK_DIAS * 24 * 3_600_000;
      const recemConcluido = !!(conclusao && conclusao.getTime() >= janelaSla);
      // Recalcula: em aberto/recém-concluído E (sem SLA ainda, "Em andamento" ou atividade nova).
      const precisaSla = (aberto || recemConcluido) &&
        (slaHorasUteis === null || status === 'Em andamento' || mudou);

      if (precisaSla) {
        // Extrai ID interno do protocolo para acessar o detalhe do ticket
        const ticketId = await page.evaluate((prot: string) => {
          const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href*="/Ticket/TicketPrincipal/"]`));
          const link  = links.find(a => a.textContent?.trim() === prot);
          return link?.href?.split('/').pop() ?? null;
        }, protocolo);

        if (ticketId) {
          const events  = await fetchTicketHistory(page, ticketId);
          slaHorasUteis = calcSlaTempoUtil(events, grupoNome, roster);
          slaStatus     = getSlaStatus(slaHorasUteis, META_SLA);
          if (events.length) primeirTramite = new Date(events[0].ts);
          ticketsSla++;
          // Volta para a lista após acessar o detalhe
          await page.goto(`${BASE}/Ticket?customSearchMenu=29180`, { waitUntil: 'networkidle', timeout: 20_000 });
          await waitIdle(page);
        }
      }

      await prisma.ticket.upsert({
        where:  { protocolo },
        create: {
          protocolo,
          assunto:       String(r['Assunto'] ?? '').trim(),
          status,
          grupo:         grupoNome,
          consultor:     String(r['Responsável'] ?? '').trim(),
          modulo:        String(r['Módulo'] ?? '').trim(),
          cliente:       String(r['Cliente'] ?? '').trim(),
          abertura,
          primeirTramite,
          ultimoTramite: ultTram,
          conclusao,
          slaStatus,
          slaHorasUteis,
        },
        update: {
          status,
          conclusao,
          ultimoTramite:  ultTram,
          primeirTramite: primeirTramite ?? undefined,
          slaStatus,
          slaHorasUteis:  slaHorasUteis ?? undefined,
        },
      });

      if (!existing) ticketsNovos++;
    }

    log(`✅ Concluído! ${ticketsNovos} novos, ${ticketsSla} SLAs calculados`);

  } finally {
    await browser.close();
    await prisma.colecaoLog.update({
      where: { id: coleta.id },
      data: {
        concluidoEm:  new Date(),
        status:       'concluido',
        ticketsNovos,
        ticketsSla,
        totalTickets: await prisma.ticket.count(),
      },
    });
    await prisma.$disconnect();
  }
}

main().catch(async err => {
  console.error('❌ Erro fatal:', err?.message ?? err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

