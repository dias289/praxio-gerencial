import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TIMES } from '@/app/api/metrics/route';

export const dynamic = 'force-dynamic';

function periodoWhere(periodo: string, mes: string | null) {
  const agora = new Date();
  const anoEspecifico = /^\d{4}$/.test(periodo) ? parseInt(periodo) : null;
  const mesEspecifico = mes ? parseInt(mes) : null;

  if (anoEspecifico) {
    if (mesEspecifico && mesEspecifico >= 1 && mesEspecifico <= 12) {
      const ini = new Date(anoEspecifico, mesEspecifico - 1, 1);
      const fim = new Date(anoEspecifico, mesEspecifico, 1);
      return { OR: [{ abertura: { gte: ini, lt: fim } }, { conclusao: { gte: ini, lt: fim } }] };
    }
    const ini = new Date(anoEspecifico, 0, 1);
    const fim = new Date(anoEspecifico + 1, 0, 1);
    return { OR: [{ abertura: { gte: ini, lt: fim } }, { conclusao: { gte: ini, lt: fim } }] };
  }
  switch (periodo) {
    case 'mes':       { const d = new Date(agora.getFullYear(), agora.getMonth(), 1); return { abertura: { gte: d } }; }
    case 'trimestre': { const d = new Date(agora.getFullYear(), agora.getMonth() - 2, 1); return { abertura: { gte: d } }; }
    case 'ano':       { const d = new Date(agora.getFullYear(), 0, 1); return { abertura: { gte: d } }; }
    default:          return {};
  }
}

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const periodo = sp.get('periodo') ?? 'ano';
  const mes     = sp.get('mes');
  const time    = sp.get('time') ?? 'todos';

  const where: any = { slaStatus: { not: 'pendente' }, ...periodoWhere(periodo, mes) };
  if (time !== 'todos' && TIMES[time]) where.grupo = { in: TIMES[time] };

  const tickets = await prisma.ticket.findMany({
    where,
    select: { consultor: true, grupo: true, modulo: true, slaStatus: true, slaHorasUteis: true, abertura: true },
  });

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const total   = tickets.length;
  const dentro  = tickets.filter(t => t.slaStatus === 'dentro').length;
  const fora    = tickets.filter(t => t.slaStatus === 'fora').length;
  const horas   = tickets.filter(t => t.slaHorasUteis !== null).map(t => t.slaHorasUteis!);
  const tmaMedio = horas.length > 0 ? Math.round(horas.reduce((s, v) => s + v, 0) / horas.length * 10) / 10 : null;
  const slaPercent = total > 0 ? Math.round((dentro / total) * 100) : 0;

  // ── Distribuição TMA ──────────────────────────────────────────────────────
  const distTma = { '<4h': 0, '4-8h': 0, '8-24h': 0, '24h+': 0 };
  for (const h of horas) {
    if      (h < 4)  distTma['<4h']++;
    else if (h < 8)  distTma['4-8h']++;
    else if (h < 24) distTma['8-24h']++;
    else             distTma['24h+']++;
  }

  // ── Por grupo ─────────────────────────────────────────────────────────────
  const grupoMap = new Map<string, { dentro: number; fora: number; somaH: number; countH: number }>();
  for (const t of tickets) {
    if (!grupoMap.has(t.grupo)) grupoMap.set(t.grupo, { dentro: 0, fora: 0, somaH: 0, countH: 0 });
    const g = grupoMap.get(t.grupo)!;
    if (t.slaStatus === 'dentro') g.dentro++;
    if (t.slaStatus === 'fora')   g.fora++;
    if (t.slaHorasUteis !== null) { g.somaH += t.slaHorasUteis; g.countH++; }
  }
  const porGrupo = Array.from(grupoMap.entries()).map(([grupo, v]) => ({
    grupo, dentro: v.dentro, fora: v.fora,
    slaPercent: (v.dentro + v.fora) > 0 ? Math.round((v.dentro / (v.dentro + v.fora)) * 100) : 0,
    tmaMedio: v.countH > 0 ? Math.round(v.somaH / v.countH * 10) / 10 : null,
  })).sort((a, b) => b.dentro + b.fora - (a.dentro + a.fora));

  // ── Por módulo ────────────────────────────────────────────────────────────
  const moduloMap = new Map<string, { dentro: number; fora: number }>();
  for (const t of tickets) {
    const m = t.modulo || 'Sem módulo';
    if (!moduloMap.has(m)) moduloMap.set(m, { dentro: 0, fora: 0 });
    const v = moduloMap.get(m)!;
    if (t.slaStatus === 'dentro') v.dentro++;
    if (t.slaStatus === 'fora')   v.fora++;
  }
  const porModulo = Array.from(moduloMap.entries()).map(([modulo, v]) => ({
    modulo, dentro: v.dentro, fora: v.fora,
    slaPercent: (v.dentro + v.fora) > 0 ? Math.round((v.dentro / (v.dentro + v.fora)) * 100) : 0,
  })).sort((a, b) => b.dentro + b.fora - (a.dentro + a.fora)).slice(0, 15);

  // ── Por consultor ─────────────────────────────────────────────────────────
  const consultorMap = new Map<string, { grupo: string; dentro: number; fora: number; somaH: number; countH: number }>();
  for (const t of tickets) {
    if (!t.consultor) continue;
    if (!consultorMap.has(t.consultor)) consultorMap.set(t.consultor, { grupo: t.grupo, dentro: 0, fora: 0, somaH: 0, countH: 0 });
    const c = consultorMap.get(t.consultor)!;
    if (t.slaStatus === 'dentro') c.dentro++;
    if (t.slaStatus === 'fora')   c.fora++;
    if (t.slaHorasUteis !== null) { c.somaH += t.slaHorasUteis; c.countH++; }
  }
  const porConsultor = Array.from(consultorMap.entries()).map(([consultor, v]) => ({
    consultor, grupo: v.grupo, dentro: v.dentro, fora: v.fora,
    slaPercent: (v.dentro + v.fora) > 0 ? Math.round((v.dentro / (v.dentro + v.fora)) * 100) : 0,
    tmaMedio: v.countH > 0 ? Math.round(v.somaH / v.countH * 10) / 10 : null,
  })).sort((a, b) => b.dentro + b.fora - (a.dentro + a.fora));

  // ── Evolução mensal ───────────────────────────────────────────────────────
  const agora = new Date();
  const evolucao: { mes: string; slaPercent: number; tma: number | null }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d    = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const fim  = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
    const key  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mes_ = tickets.filter(t => {
      const ab = new Date(t.abertura);
      return ab >= d && ab < fim;
    });
    const d_  = mes_.filter(t => t.slaStatus === 'dentro').length;
    const tot = mes_.filter(t => t.slaStatus !== 'pendente').length;
    const h_  = mes_.filter(t => t.slaHorasUteis !== null).map(t => t.slaHorasUteis!);
    evolucao.push({
      mes: key,
      slaPercent: tot > 0 ? Math.round((d_ / tot) * 100) : 0,
      tma: h_.length > 0 ? Math.round(h_.reduce((s, v) => s + v, 0) / h_.length * 10) / 10 : null,
    });
  }

  return NextResponse.json({ kpis: { total, dentro, fora, slaPercent, tmaMedio }, distTma, porGrupo, porModulo, porConsultor, evolucao });
}
