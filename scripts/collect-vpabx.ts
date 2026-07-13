/**
 * Coletor de chamadas do vpabx (IP Force) — relatório "Fila de Atendimento".
 *
 * Fluxo:
 *   1. Login (#login/#password/#autenticacao) + 2FA lido do e-mail (IMAP) e
 *      digitado nos 6 campos #code1..#code6, confirmando em #code-confirm.
 *   2. Para cada período (mês, no modo backfill) e categoria, aplica o filtro,
 *      exporta o CSV e grava no banco (modelo Chamada), com upsert (dedup).
 *
 * Env: VPABX_URL, VPABX_USER, VPABX_PASS,
 *      IMAP_HOST, IMAP_PORT, IMAP_SECURE, IMAP_USER, IMAP_PASS,
 *      DATABASE_URL, MODO_COLETA (incremental|mensal), COLETA_INICIO (YYYY-MM)
 */
import { chromium, type Page, type BrowserContext } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { lerCodigo2FA } from '../lib/imap-2fa.js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const BASE  = process.env.VPABX_URL  ?? 'https://praxio.vpabx.com.br:8127';
const USER  = process.env.VPABX_USER ?? 'felipedias';
const PASS  = process.env.VPABX_PASS ?? '';
const MODO  = (process.env.MODO_COLETA ?? 'incremental') as 'incremental' | 'mensal';

const IMAP = {
  host: process.env.IMAP_HOST ?? 'email-ssl.com.br',
  port: Number(process.env.IMAP_PORT ?? 143),
  secure: (process.env.IMAP_SECURE ?? 'false') === 'true',
  user: process.env.IMAP_USER ?? '',
  pass: process.env.IMAP_PASS ?? '',
};

// Categorias do relatório (seletores confirmados ao vivo no vpabx).
// Cada uma tem: aba (btn), ícone que abre o modal (csv) e botão de download (exportar).
const CATEGORIAS = [
  { btn: 'btn-cdr',           csv: 'csv-registros',     exportar: 'exportar-csv-registros',     categoria: 'atendida' },
  { btn: 'btn-abandonadas',   csv: 'csv-abandonadas',   exportar: 'exportar-csv-abandonadas',   categoria: 'abandonada' },
  { btn: 'btn-excedidas',     csv: 'csv-excedidas',     exportar: 'exportar-csv-excedidas',     categoria: 'excedida' },
  { btn: 'btn-desconectadas', csv: 'csv-desconectadas', exportar: 'exportar-csv-desconectadas', categoria: 'desconectada' },
] as const;

const prisma = new PrismaClient();
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

// ── Utils ─────────────────────────────────────────────────────────────────────
function segundos(hms: string): number {
  const m = String(hms).match(/(\d+):(\d{2}):(\d{2})/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
}
function parseDataHora(s: string): Date | null {
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]));
}
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ';' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// ── Login + 2FA ────────────────────────────────────────────────────────────────
async function login(page: Page): Promise<void> {
  const inicioLogin = Date.now();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.fill('#login', USER);
  await page.fill('#password', PASS);
  await page.click('#autenticacao');

  const apareceu2FA = await page.waitForSelector('#code1', { state: 'visible', timeout: 15_000 })
    .then(() => true).catch(() => false);
  if (apareceu2FA) {
    log('2FA solicitado — lendo código do e-mail...');
    const codigo = await lerCodigo2FA({ ...IMAP, desdeMs: inicioLogin - 60_000, timeoutMs: 120_000 });
    if (!codigo) throw new Error('Não consegui ler o código 2FA do e-mail no tempo esperado.');
    const digitos = codigo.replace(/\D/g, '').slice(0, 6);
    log(`   Código recebido: ${'*'.repeat(digitos.length)} (${digitos.length} díg.)`);
    for (let i = 0; i < 6; i++) {
      await page.fill(`#code${i + 1}`, digitos[i] ?? '');
    }
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {}),
      page.click('#code-confirm'),
    ]);
    await page.waitForTimeout(1500);
  }
  log('   Login OK');
}

// ── Aplica o filtro de período (fila=Todas) e carrega o relatório ───────────────
async function aplicarFiltro(page: Page, aISO: string, bISO: string): Promise<void> {
  await page.goto(`${BASE}/relatorios_fila/index`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // Espera o formulário de filtro existir no DOM antes de mexer nele
  await page.waitForSelector('#aplicar', { state: 'attached', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const [ya, ma, da] = aISO.split('-'); const [yb, mb, db] = bISO.split('-');
  const di = `${da}/${ma}/${ya}`, df = `${db}/${mb}/${yb}`;
  // Tenta carregar o relatório até 3x — evita a corrida de clicar "Aplicar"
  // antes de a página inicializar o grid (que fazia o relatório vir vazio).
  for (let tent = 1; tent <= 3; tent++) {
    // Sem função interna aqui: o esbuild/tsx injeta um helper __name que quebra no navegador.
    await page.evaluate(({ di, df }: { di: string; df: string }) => {
      const campos: [string, string][] = [
        ['data_inicial', di], ['data_final', df],
        ['hora_inicial', '00:00'], ['hora_final', '23:59'],
        ['fila', '%'],   // Todas as filas (filtra por Siga-i depois, no dashboard)
        ['tipo', '1'],   // começa em Atendidas; as abas trocam de categoria
      ];
      for (const [id, v] of campos) {
        const e = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        if (e) { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      // #aplicar fica no painel de filtro recolhido (invisível p/ o Playwright);
      // clicamos via JS, que dispara o handler mesmo com o painel oculto.
      (document.getElementById('aplicar') as HTMLElement | null)?.click();
    }, { di, df });
    const ok = await page.waitForSelector('#btn-cdr', { state: 'visible', timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (ok) { await page.waitForTimeout(1200); return; }
    log(`   (tentativa ${tent}: relatório não carregou, repetindo...)`);
    await page.waitForTimeout(1500);
  }
}

// ── Exporta o CSV de uma categoria: ícone -> modal -> botão verde -> download ────
async function exportarCsv(page: Page, csvId: string, exportarId: string): Promise<Buffer | null> {
  // Se o ícone de export não aparecer, a categoria não tem dados no período — pula rápido.
  const temIcone = await page.waitForSelector(`#${csvId}`, { state: 'visible', timeout: 4000 })
    .then(() => true).catch(() => false);
  if (!temIcone) return null;
  try {
    await page.click(`#${csvId}`, { timeout: 6000 });
    await page.waitForSelector(`#${exportarId}`, { state: 'visible', timeout: 8000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.click(`#${exportarId}`),
    ]);
    const p = await download.path();
    return p ? await fs.readFile(p) : null;
  } catch (e) {
    log(`   export ${csvId} falhou: ${(e as Error).message}`);
    return null;
  }
}

// ── Parseia o CSV e grava no banco ──────────────────────────────────────────────
async function salvarCsv(buf: Buffer, categoria: string): Promise<number> {
  const txt = buf.toString('utf8').replace(/^﻿/, '');
  const linhas = txt.split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return 0;
  const head = splitCsvLine(linhas[0]).map(h => h.trim());
  const idx = (nome: string) => head.findIndex(h => h.toLowerCase().includes(nome.toLowerCase()));
  const iDH = idx('Data'), iFila = idx('Fila'), iOrig = idx('Origem'),
        iAg = idx('Agente'), iEsp = idx('Espera'), iDur = idx('Dura'), iFim = idx('Encerrada');
  let n = 0;
  for (let i = 1; i < linhas.length; i++) {
    const c = splitCsvLine(linhas[i]);
    const dataHora = parseDataHora(c[iDH] ?? '');
    if (!dataHora) continue;
    const fila = (c[iFila] ?? '').trim();
    const origemFull = (iOrig >= 0 ? c[iOrig] : '').toString().trim();
    const numMatch = origemFull.match(/\((\d[\d\s-]*)\)\s*$/) ?? origemFull.match(/(\d[\d\s-]{5,})/);
    const origemNumero = numMatch ? numMatch[1].replace(/[\s-]/g, '') : '';
    const origemNome = origemFull.replace(/\s*\(\d[\d\s-]*\)\s*$/, '').trim();
    const agFull = (c[iAg] ?? '').toString().trim();
    const agente = agFull.replace(/\s*-\s*\d+.*$/, '').trim();
    const ramalMatch = agFull.match(/\((\d+)\)\s*$/) ?? agFull.match(/-\s*(\d+)/);
    const ramal = ramalMatch ? ramalMatch[1] : '';
    try {
      await prisma.chamada.upsert({
        where: { chamada_uniq: { dataHora, fila, ramal, origemNumero, categoria } },
        create: {
          dataHora, fila, origemNumero, origemNome, categoria, ramal, agente,
          tempoEspera: segundos(c[iEsp] ?? ''), duracao: segundos(c[iDur] ?? ''),
          encerradaPor: (c[iFim] ?? '').trim(),
        },
        update: {
          agente, origemNome, tempoEspera: segundos(c[iEsp] ?? ''), duracao: segundos(c[iDur] ?? ''),
          encerradaPor: (c[iFim] ?? '').trim(),
        },
      });
      n++;
    } catch { /* linha inválida, ignora */ }
  }
  return n;
}

// ── Coleta de um período (todas as categorias) ──────────────────────────────────
async function coletarPeriodo(page: Page, aISO: string, bISO: string): Promise<number> {
  await aplicarFiltro(page, aISO, bISO);
  let total = 0;
  for (const c of CATEGORIAS) {
    await page.click(`#${c.btn}`, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const buf = await exportarCsv(page, c.csv, c.exportar);
    if (buf) { const n = await salvarCsv(buf, c.categoria); total += n; log(`   ${aISO} ${c.categoria}: ${n}`); }
    else { log(`   ${aISO} ${c.categoria}: 0 (sem dados)`); }
  }
  return total;
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function main() {
  if (!PASS || !IMAP.user || !IMAP.pass) {
    log('Configure VPABX_PASS, IMAP_USER e IMAP_PASS'); process.exit(1);
  }
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  });
  let total = 0;
  try {
    const ctx: BrowserContext = await browser.newContext({ acceptDownloads: true, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    // Shim: garante __name no navegador (helper injetado pelo tsx/esbuild)
    await page.addInitScript(() => {
      const g = globalThis as unknown as { __name?: unknown };
      if (!g.__name) g.__name = (f: unknown) => f;
    });
    await login(page);

    if (MODO === 'mensal') {
      const inicio = process.env.COLETA_INICIO ?? '2022-01';
      const now = new Date();
      let y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
      let vazios = 0;
      for (let k = 0; k < 120; k++) {
        const a = `${y}-${String(m).padStart(2, '0')}-01`;
        const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const b = `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
        const nP = await coletarPeriodo(page, a, b);
        total += nP;
        if (nP === 0) { if (++vazios >= 3) break; } else vazios = 0;
        m--; if (m < 1) { m = 12; y--; }
        if (`${y}-${String(m).padStart(2, '0')}` < inicio) break;
      }
    } else {
      const now = new Date();
      for (const off of [0, 1]) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - off, 1));
        const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
        const a = `${y}-${String(m).padStart(2, '0')}-01`;
        const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const b = `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
        total += await coletarPeriodo(page, a, b);
      }
    }
    log(`Concluído! ${total} chamadas gravadas/atualizadas`);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(async err => {
  console.error('Erro fatal:', err?.message ?? err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
