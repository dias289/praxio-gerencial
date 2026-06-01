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
import { calcHorasUteis, getSlaStatus } from '../lib/business-hours.js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const BASE   = 'https://portaldocliente.praxio.com.br';
const EMAIL  = process.env.PORTAL_EMAIL ?? '';
const SENHA  = process.env.PORTAL_SENHA  ?? '';

// IDs dos grupos Siga (confirmados via diagnóstico)
const GROUP_SQL = `([IdGrupoAtendimento] In (18, 28, 30, 31, 32))`;
const GROUP_ID_MAP: Record<string, string> = {
  '18': 'Siga-i ADM',  '28': 'Siga-i OPER',
  '30': 'Siga Emissor','31': 'Siga One - ADM','32': 'Siga One - OPER',
};

// Janela para buscar SLA: tickets abertos nas últimas 72h que ainda não têm 1º trâmite
const SLA_WINDOW_HOURS = 72;

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

    // ── Ativa pesquisa que bypassa escopo de usuário ───────────────────────
    await page.goto(`${BASE}/Ticket?customSearchMenu=29180`, { waitUntil: 'networkidle', timeout: 30_000 });
    await waitIdle(page);
    await page.waitForTimeout(1000);

    // Aplica filtro dos 5 grupos Siga
    await page.evaluate((sql: string) => {
      (window as any).grdTicket?.ApplyFilter?.(sql);
    }, GROUP_SQL);
    await waitIdle(page);
    await page.waitForTimeout(1500);

    // ── Exporta todos os status ───────────────────────────────────────────
    const allRows: Record<string, string>[] = [];

    // Em andamento, Pendente, Cancelado (todos os grupos juntos)
    for (const status of ['Em andamento', 'Pendente cliente', 'Cancelado']) {
      await setFilter(page, 4, status);
      const buf = await downloadXlsx(page, ctx, status);
      if (buf) { const rows = parseXlsxBuffer(buf); allRows.push(...rows); log(`   ${status}: ${rows.length}`); }
    }

    // Concluídos — um grupo por vez (evita timeout de export com 50k+ registros)
    log('   Concluído (por grupo)...');
    await page.goto(`${BASE}/Ticket`, { waitUntil: 'networkidle', timeout: 20_000 });
    await waitIdle(page);
    await setFilter(page, 4, 'Concluído');
    for (const groupName of Object.values(GROUP_ID_MAP)) {
      await setFilter(page, 19, groupName);
      const buf = await downloadXlsx(page, ctx, 'Concluído');
      if (buf) { const rows = parseXlsxBuffer(buf); allRows.push(...rows); process.stdout.write(`   ${groupName}: ${rows.length}\n`); }
    }
    await setFilter(page, 19, '');

    log(`   Total bruto: ${allRows.length} linhas`);

    // ── Processa e salva ──────────────────────────────────────────────────
    const seen = new Set<string>();
    const cutoff = new Date(Date.now() - SLA_WINDOW_HOURS * 3_600_000);

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

      // Verifica se já está no banco e se precisa buscar SLA
      const existing = await prisma.ticket.findUnique({ where: { protocolo }, select: { primeirTramite: true, slaStatus: true } });

      let primeirTramite = existing?.primeirTramite ?? null;
      let slaStatus      = existing?.slaStatus ?? 'pendente';
      let slaHorasUteis: number | null = null;

      // Busca 1º trâmite para tickets novos ou sem SLA, dentro da janela de 72h
      const precisaSla = !existing || (!primeirTramite && abertura >= cutoff);
      if (precisaSla && status !== 'Cancelado') {
        // Extrai ID interno do protocolo para acessar detalhe
        const ticketId = await page.evaluate((prot: string) => {
          const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href*="/Ticket/TicketPrincipal/"]`));
          const link  = links.find(a => a.textContent?.trim() === prot);
          return link?.href?.split('/').pop() ?? null;
        }, protocolo);

        if (ticketId) {
          primeirTramite = await fetchFirstTramite(page, ticketId);
          ticketsSla++;
          // Volta para a lista após acessar o detalhe
          await page.goto(`${BASE}/Ticket?customSearchMenu=29180`, { waitUntil: 'networkidle', timeout: 20_000 });
          await waitIdle(page);
        }
      }

      if (primeirTramite) {
        slaHorasUteis = calcHorasUteis(abertura, primeirTramite);
        slaStatus     = getSlaStatus(slaHorasUteis);
      } else if (abertura < cutoff && status !== 'Cancelado') {
        // Ticket aberto há mais de 72h sem 1º trâmite = fora do SLA
        slaStatus = 'fora';
        slaHorasUteis = calcHorasUteis(abertura, new Date());
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
          ultimoTramite: ultTram,
          primeirTramite: primeirTramite ?? undefined,
          slaStatus,
          slaHorasUteis: slaHorasUteis ?? undefined,
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
        concluidoEm: new Date(),
        status:      'concluido',
        ticketsNovos,
        ticketsSla,
        totalTickets: await prisma.ticket.count(),
      },
    });
    await prisma.$disconnect();
  }
}

main().catch(async err => {
  console.error('❌ Erro fatal:', err.message ?? err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
