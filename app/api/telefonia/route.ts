import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Filas do time Siga-i (foco do painel). "todas" mostra todas as filas capturadas.
const FILAS_SIGAI = ['MG-SIGAI-ADM', 'MG-SIGAI-OPERACIONAL'];

type Ch = { dataHora: Date; fila: string; agente: string; tempoEspera: number; duracao: number; categoria: string };

export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const periodo    = sp.get('periodo') ?? 'ano';
  const mesParam   = sp.get('mes');
  const filaFiltro = sp.get('fila') ?? 'sigai';   // 'sigai' | 'todas'

  const where: any = {};
  if (filaFiltro !== 'todas') where.fila = { in: FILAS_SIGAI };

  const chamadas = (await prisma.chamada.findMany({
    where,
    select: { dataHora: true, fila: true, agente: true, tempoEspera: true, duracao: true, categoria: true },
  })) as Ch[];

  // ── Janela do período ────────────────────────────────────────────────────────
  const agora = new Date();
  let ini: Date | null = null, fim: Date | null = null;
  const ano  = /^\d{4}$/.test(periodo) ? parseInt(periodo) : null;
  const mesN = mesParam ? parseInt(mesParam) : null;
  if (ano) {
    if (mesN && mesN >= 1 && mesN <= 12) { ini = new Date(Date.UTC(ano, mesN - 1, 1)); fim = new Date(Date.UTC(ano, mesN, 1)); }
    else { ini = new Date(Date.UTC(ano, 0, 1)); fim = new Date(Date.UTC(ano + 1, 0, 1)); }
  } else if (periodo === 'mes')       ini = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  else if (periodo === 'trimestre')   ini = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 2, 1));
  else if (periodo === 'ano')         ini = new Date(Date.UTC(agora.getUTCFullYear(), 0, 1));
  // 'tudo' → ini/fim null

  const noPeriodo = (d: Date) => (!ini || d >= ini) && (!fim || d < fim);
  const periodoCh = chamadas.filter(c => noPeriodo(c.dataHora));

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const atend = periodoCh.filter(c => c.categoria === 'atendida');
  const aband = periodoCh.filter(c => c.categoria === 'abandonada');
  const nAtend = atend.length, nAband = aband.length;
  const kpis = {
    total: periodoCh.length,
    atendidas: nAtend,
    abandonadas: nAband,
    pctAband: (nAtend + nAband) > 0 ? Math.round(nAband / (nAtend + nAband) * 100) : 0,
    esperaMedSeg: nAtend ? Math.round(atend.reduce((s, c) => s + c.tempoEspera, 0) / nAtend) : 0,
    tmaSeg:       nAtend ? Math.round(atend.reduce((s, c) => s + c.duracao, 0) / nAtend) : 0,
  };

  // ── Série mensal (atendidas vs abandonadas) ───────────────────────────────────
  const meses: Record<string, { atendidas: number; abandonadas: number }> = {};
  const chaveMes = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  if (ano) {
    for (let m = 0; m < 12; m++) meses[`${ano}-${String(m + 1).padStart(2, '0')}`] = { atendidas: 0, abandonadas: 0 };
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1));
      meses[chaveMes(d)] = { atendidas: 0, abandonadas: 0 };
    }
  }
  for (const c of chamadas) {
    const k = chaveMes(c.dataHora);
    if (!meses[k]) continue;
    if (c.categoria === 'atendida')   meses[k].atendidas++;
    if (c.categoria === 'abandonada') meses[k].abandonadas++;
  }
  const serieMensal = Object.entries(meses).map(([mes, v]) => ({ mes, ...v }));

  // ── Comparativo ano a ano (atendidas, mesmo mês entre anos) ────────────────────
  const anosSet = new Set<number>();
  const yoyMap: Record<number, number[]> = {}; // ano -> 12 meses
  for (const c of chamadas) {
    if (c.categoria !== 'atendida') continue;
    const y = c.dataHora.getUTCFullYear(), m = c.dataHora.getUTCMonth();
    anosSet.add(y);
    (yoyMap[y] ??= new Array(12).fill(0))[m]++;
  }
  const anos = [...anosSet].sort();
  const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const anoAano = NOMES_MES.map((nome, m) => {
    const linha: Record<string, number | string> = { mes: nome };
    for (const y of anos) linha[String(y)] = yoyMap[y]?.[m] ?? 0;
    return linha;
  });

  // Crescimento comparável (Jan..mês atual) das atendidas, ano vs ano anterior
  const mesAtual = agora.getUTCMonth();
  const ytd = (y: number) => (yoyMap[y] ?? []).slice(0, mesAtual + 1).reduce((s, v) => s + v, 0);
  const anoResumo = anos.map((y, i) => {
    const ant = i > 0 ? anos[i - 1] : null;
    const a = ytd(y), b = ant !== null ? ytd(ant) : 0;
    return {
      ano: y,
      total: (yoyMap[y] ?? []).reduce((s, v) => s + v, 0),
      ytd: a,
      cresc: (ant !== null && b > 0) ? Math.round((a - b) / b * 100) : null,
    };
  });

  // ── Por fila (no período) ─────────────────────────────────────────────────────
  const filaMap = new Map<string, { atendidas: number; abandonadas: number }>();
  for (const c of periodoCh) {
    const f = filaMap.get(c.fila) ?? { atendidas: 0, abandonadas: 0 };
    if (c.categoria === 'atendida')   f.atendidas++;
    if (c.categoria === 'abandonada') f.abandonadas++;
    filaMap.set(c.fila, f);
  }
  const porFila = [...filaMap.entries()].map(([fila, v]) => ({ fila, ...v }))
    .sort((a, b) => (b.atendidas + b.abandonadas) - (a.atendidas + a.abandonadas));

  // ── Por agente (top 15, só atendidas) ─────────────────────────────────────────
  const agMap = new Map<string, { atendidas: number; somaDur: number }>();
  for (const c of atend) {
    if (!c.agente) continue;
    const a = agMap.get(c.agente) ?? { atendidas: 0, somaDur: 0 };
    a.atendidas++; a.somaDur += c.duracao;
    agMap.set(c.agente, a);
  }
  const porAgente = [...agMap.entries()].map(([agente, v]) => ({
    agente, atendidas: v.atendidas, tmaSeg: v.atendidas ? Math.round(v.somaDur / v.atendidas) : 0,
  })).sort((a, b) => b.atendidas - a.atendidas).slice(0, 15);

  const ultima = chamadas.reduce((mx, c) => c.dataHora > mx ? c.dataHora : mx, new Date(0));

  return NextResponse.json({
    kpis, serieMensal, anoAano, anos: anos.map(String), anoResumo, mesAtual, porFila, porAgente,
    filaFiltro, ultimaChamada: ultima.getTime() ? ultima : null,
  });
}
