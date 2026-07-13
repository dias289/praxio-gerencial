/**
 * Passada dedicada de SLA "tempo útil sob o time" para o BACKLOG (tickets em aberto).
 *
 * Por que separado: o cálculo precisa do ID interno de cada ticket, que só é obtido
 * pelo link no grid do portal. Este script filtra o grid por cada status em aberto,
 * percorre TODAS as páginas coletando protocolo -> IdInterno, e então abre o detalhe
 * de cada ticket (direto pelo ID) para ler o histórico e calcular o tempo útil.
 *
 * Uso: npx tsx scripts/collect-sla.ts
 */
import { chromium, type Page } from 'playwright';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getSlaStatus } from '../lib/business-hours.js';
import { calcSlaTempoUtil, buildRoster, type Tramite, type Roster } from '../lib/sla-tempo-util.js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const BASE     = 'https://portaldocliente.praxio.com.br';
const EMAIL    = process.env.PORTAL_EMAIL ?? '';
const SENHA    = process.env.PORTAL_SENHA ?? '';
const META_SLA = Number(process.env.META_SLA_HORAS ?? 24);
const GROUP_SQL = '([IdGrupoAtendimento] In (18, 28, 30, 31, 32))';

const prisma = new PrismaClient();
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

async function waitIdle(page: Page) {
  await page.waitForFunction(() => {
    const w = window as any;
    if (!w.grdTicket) return false;
    try { return !w.grdTicket.InCallback?.(); } catch { return true; }
  }, { timeout: 25_000, polling: 300 }).catch(() => {});
}

// Filtro por coluna (auto-filter) — col 4 = Status
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

// Percorre todas as páginas do grid atual coletando protocolo -> IdInterno
async function coletarIds(page: Page): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageCount: number = await page.evaluate(() => {
    const g = (window as any).grdTicket; return g?.GetPageCount?.() ?? 1;
  });
  const total = Math.min(pageCount, 800);
  for (let p = 0; p < total; p++) {
    if (p > 0) {
      await page.evaluate((idx: number) => { (window as any).grdTicket?.GotoPage?.(idx); }, p);
      await waitIdle(page);
      await page.waitForTimeout(250);
    }
    const pares = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/Ticket/TicketPrincipal/"]'));
      return links.map(a => ({ prot: (a.textContent || '').trim(), id: a.href.split('/').pop() || '' }));
    });
    for (const { prot, id } of pares) if (prot && id) map.set(prot, id);
  }
  return map;
}

// Lê o histórico de trâmites (status + assumido/transferido) do detalhe do ticket
async function fetchTicketHistory(page: Page, ticketId: string): Promise<Tramite[]> {
  try {
    await page.goto(`${BASE}/Ticket/TicketPrincipal/${ticketId}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(700);
    const evs = await page.evaluate(() => {
      const STS = 'Ticket aberto|Em andamento|Pendente cliente|Aguardando adequação|Cancelado|Concluído|Reaberto';
      const reS = new RegExp('Status:\\s*(' + STS + ')', 'i');
      const items = Array.from(document.querySelectorAll('.itemdiv.dialogdiv'));
      const out: { ts: number; status: string | null; assumido: string | null; transfPara: string | null }[] = [];
      for (const it of items) {
        const txt = (it.textContent || '').replace(/\s+/g, ' ').trim();
        const tm = txt.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if (!tm) continue;
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

async function main() {
  if (!EMAIL || !SENHA) { log('❌ PORTAL_EMAIL e PORTAL_SENHA não configurados'); process.exit(1); }

  // Roster e backlog vêm do banco (já populado pelo backfill)
  const roster: Roster = buildRoster(await prisma.ticket.findMany({ select: { grupo: true, consultor: true } }), 20);
  const statusRows = await prisma.ticket.findMany({
    where: { status: { notIn: ['Concluído', 'Cancelado'] } },
    select: { status: true }, distinct: ['status'],
  });
  const statuses = statusRows.map(r => r.status).filter(Boolean);
  const abertos = await prisma.ticket.findMany({
    where: { status: { notIn: ['Concluído', 'Cancelado'] } },
    select: { protocolo: true, grupo: true },
  });
  log(`Backlog em aberto: ${abertos.length} tickets | status: ${statuses.join(', ')}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });
  let ok = 0;
  try {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
    const page = await ctx.newPage();

    // Login
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

    // Base bypass + filtro de grupo
    await page.goto(`${BASE}/Ticket?customSearchMenu=29180`, { waitUntil: 'networkidle', timeout: 30_000 });
    await waitIdle(page);
    await page.evaluate((sql: string) => { (window as any).grdTicket?.ApplyFilter?.(sql); }, GROUP_SQL);
    await waitIdle(page);
    await page.waitForTimeout(600);

    // Coleta protocolo -> IdInterno percorrendo cada status em aberto
    const idMap = new Map<string, string>();
    for (const st of statuses) {
      await setFilter(page, 4, st);
      const m = await coletarIds(page);
      for (const [k, v] of m) idMap.set(k, v);
      log(`   ${st}: ${m.size} ids coletados`);
    }
    await setFilter(page, 4, '');
    log(`Total de IDs mapeados: ${idMap.size}`);

    // Calcula o SLA de cada ticket em aberto e grava
    for (const t of abertos) {
      const id = idMap.get(t.protocolo);
      if (!id) continue;
      const events = await fetchTicketHistory(page, id);
      const slaHorasUteis = calcSlaTempoUtil(events, t.grupo, roster);
      const slaStatus = getSlaStatus(slaHorasUteis, META_SLA);
      const primeirTramite = events.length ? new Date(events[0].ts) : null;
      await prisma.ticket.update({
        where: { protocolo: t.protocolo },
        data: { slaHorasUteis, slaStatus, primeirTramite: primeirTramite ?? undefined },
      });
      ok++;
      if (ok % 100 === 0) log(`   ${ok}/${abertos.length} SLAs calculados...`);
    }
    log(`✅ Concluído! ${ok} SLAs calculados de ${abertos.length} tickets em aberto`);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(async err => {
  console.error('❌ Erro fatal:', err?.message ?? err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
