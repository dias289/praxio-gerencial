import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/metrics
 * Retorna métricas consolidadas para o dashboard.
 *
 * Query params:
 *   periodo   = "mes" | "trimestre" | "ano" | "tudo" (default: "ano")
 *   grupo     = nome do grupo | "todos"
 *   consultor = nome do consultor | "todos"
 */
export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const periodo   = sp.get('periodo')   ?? 'ano';
  const grupo     = sp.get('grupo')     ?? 'todos';
  const consultor = sp.get('consultor') ?? 'todos';

  // Define data de início do período
  const agora = new Date();
  let dataInicio: Date;
  switch (periodo) {
    case 'mes':       dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1); break;
    case 'trimestre': dataInicio = new Date(agora.getFullYear(), agora.getMonth() - 2, 1); break;
    case 'ano':       dataInicio = new Date(agora.getFullYear(), 0, 1); break;
    default:          dataInicio = new Date(2020, 0, 1); // tudo
  }

  const where: any = { abertura: { gte: dataInicio } };
  if (grupo     !== 'todos') where.grupo     = grupo;
  if (consultor !== 'todos') where.consultor = consultor;

  // Busca todos os tickets do período
  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      protocolo:     true,
      status:        true,
      grupo:         true,
      consultor:     true,
      abertura:      true,
      primeirTramite:true,
      conclusao:     true,
      slaStatus:     true,
      slaHorasUteis: true,
    },
    orderBy: { abertura: 'asc' },
  });

  // ── KPIs globais ──────────────────────────────────────────────────────────
  const total      = tickets.length;
  const concluidos = tickets.filter(t => t.status === 'Concluído').length;
  const emAberto   = tickets.filter(t => t.status === 'Em andamento' || t.status === 'Pendente cliente').length;
  const slaDentro  = tickets.filter(t => t.slaStatus === 'dentro').length;
  const slaTotal   = tickets.filter(t => t.slaStatus !== 'pendente').length;
  const slaPercent = slaTotal > 0 ? Math.round((slaDentro / slaTotal) * 100) : 0;

  const tmaSlaHoras = tickets
    .filter(t => t.slaHorasUteis !== null)
    .reduce((s, t) => s + t.slaHorasUteis!, 0);
  const tmaCount = tickets.filter(t => t.slaHorasUteis !== null).length;
  const tmaMedio = tmaCount > 0 ? Math.round((tmaSlaHoras / tmaCount) * 10) / 10 : null;

  // ── Por consultor ─────────────────────────────────────────────────────────
  const consultorMap = new Map<string, {
    consultor: string; grupo: string;
    total: number; concluidos: number; emAberto: number;
    slaDentro: number; slaFora: number; slaPendente: number;
    somaHoras: number; countHoras: number;
    porMes: Record<string, number>; // "YYYY-MM" → concluídos
  }>();

  for (const t of tickets) {
    if (!t.consultor) continue;
    if (!consultorMap.has(t.consultor)) {
      consultorMap.set(t.consultor, {
        consultor: t.consultor, grupo: t.grupo,
        total: 0, concluidos: 0, emAberto: 0,
        slaDentro: 0, slaFora: 0, slaPendente: 0,
        somaHoras: 0, countHoras: 0, porMes: {},
      });
    }
    const c = consultorMap.get(t.consultor)!;
    c.total++;
    if (t.status === 'Concluído') {
      c.concluidos++;
      // Agrupa por mês de conclusão
      if (t.conclusao) {
        const mes = `${t.conclusao.getFullYear()}-${String(t.conclusao.getMonth() + 1).padStart(2, '0')}`;
        c.porMes[mes] = (c.porMes[mes] ?? 0) + 1;
      }
    }
    if (t.status === 'Em andamento' || t.status === 'Pendente cliente') c.emAberto++;
    if (t.slaStatus === 'dentro')   c.slaDentro++;
    if (t.slaStatus === 'fora')     c.slaFora++;
    if (t.slaStatus === 'pendente') c.slaPendente++;
    if (t.slaHorasUteis !== null) { c.somaHoras += t.slaHorasUteis; c.countHoras++; }
  }

  const porConsultor = Array.from(consultorMap.values()).map(c => {
    const slaTotal = c.slaDentro + c.slaFora;
    const slaPercent = slaTotal > 0 ? Math.round((c.slaDentro / slaTotal) * 100) : null;
    const tmaMedio = c.countHoras > 0 ? Math.round((c.somaHoras / c.countHoras) * 10) / 10 : null;
    // Média mensal de concluídos
    const mesesAtivos = Object.keys(c.porMes).length;
    const mediaMensal = mesesAtivos > 0 ? Math.round((c.concluidos / mesesAtivos) * 10) / 10 : 0;
    return {
      consultor:    c.consultor,
      grupo:        c.grupo,
      total:        c.total,
      concluidos:   c.concluidos,
      emAberto:     c.emAberto,
      slaPercent,
      tmaMedio,
      mediaMensal,
      porMes:       c.porMes,
    };
  }).sort((a, b) => b.concluidos - a.concluidos);

  // ── Série mensal global (últimos 12 meses) ────────────────────────────────
  const meses: Record<string, { abertos: number; concluidos: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d   = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses[key] = { abertos: 0, concluidos: 0 };
  }
  for (const t of tickets) {
    const keyAb = `${t.abertura.getFullYear()}-${String(t.abertura.getMonth() + 1).padStart(2, '0')}`;
    if (meses[keyAb]) meses[keyAb].abertos++;
    if (t.conclusao) {
      const keyConc = `${t.conclusao.getFullYear()}-${String(t.conclusao.getMonth() + 1).padStart(2, '0')}`;
      if (meses[keyConc]) meses[keyConc].concluidos++;
    }
  }
  const serieMensal = Object.entries(meses).map(([mes, v]) => ({ mes, ...v }));

  // ── Grupos disponíveis ────────────────────────────────────────────────────
  const grupos     = [...new Set(tickets.map(t => t.grupo))].filter(Boolean).sort();
  const consultores = [...new Set(tickets.map(t => t.consultor))].filter(Boolean).sort();

  // ── Última coleta ─────────────────────────────────────────────────────────
  const ultimaColeta = await prisma.colecaoLog.findFirst({
    orderBy: { iniciadoEm: 'desc' },
    where: { status: 'concluido' },
    select: { concluidoEm: true, totalTickets: true },
  });

  return NextResponse.json({
    kpis: { total, concluidos, emAberto, slaPercent, tmaMedio },
    porConsultor,
    serieMensal,
    grupos,
    consultores,
    ultimaColeta,
  });
}
