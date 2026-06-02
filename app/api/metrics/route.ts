import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// ── Definição dos times ───────────────────────────────────────────────────────
export const TIMES: Record<string, string[]> = {
  'Administrativo': ['Siga-i ADM', 'Siga One - ADM', 'Siga Emissor'],
  'Operacional':    ['Siga-i OPER', 'Siga One - OPER'],
};

export function grupoToTime(grupo: string): string {
  for (const [time, grupos] of Object.entries(TIMES)) {
    if (grupos.includes(grupo)) return time;
  }
  return 'Outros';
}

/**
 * GET /api/metrics
 * Query params:
 *   periodo   = "mes" | "trimestre" | "ano" | "tudo" | "2023" | "2024" | ...
 *   mes       = "1".."12"  (opcional; só usado quando periodo é um ano específico)
 *   time      = "Administrativo" | "Operacional" | "todos"
 *   consultor = nome do consultor | "todos"
 */
export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const periodo    = sp.get('periodo')   ?? 'tudo';
  const mesParam   = sp.get('mes');
  const timeFiltro = sp.get('time')    ?? 'todos';
  const consultor  = sp.get('consultor') ?? 'todos';

  // Define data de início/fim do período
  const agora = new Date();
  let dataInicio: Date | null = null;
  let dataFim:    Date | null = null;

  const anoEspecifico = /^\d{4}$/.test(periodo) ? parseInt(periodo) : null;
  const mesEspecifico = mesParam ? parseInt(mesParam) : null;

  if (anoEspecifico) {
    if (mesEspecifico && mesEspecifico >= 1 && mesEspecifico <= 12) {
      // Ano + mês específico (ex: março/2024)
      dataInicio = new Date(anoEspecifico, mesEspecifico - 1, 1);
      dataFim    = new Date(anoEspecifico, mesEspecifico,     1);
    } else {
      // Ano completo
      dataInicio = new Date(anoEspecifico, 0, 1);
      dataFim    = new Date(anoEspecifico + 1, 0, 1);
    }
  } else {
    switch (periodo) {
      case 'mes':       dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1); break;
      case 'trimestre': dataInicio = new Date(agora.getFullYear(), agora.getMonth() - 2, 1); break;
      case 'ano':       dataInicio = new Date(agora.getFullYear(), 0, 1); break;
      default:          dataInicio = null;
    }
  }

  const where: any = {};
  if (dataInicio && dataFim) {
    // Período fechado (ano ou mês específico)
    where.OR = [
      { abertura:  { gte: dataInicio, lt: dataFim } },
      { conclusao: { gte: dataInicio, lt: dataFim } },
    ];
  } else if (dataInicio) {
    where.OR = [
      { abertura:  { gte: dataInicio } },
      { conclusao: { gte: dataInicio } },
    ];
  }
  if (timeFiltro !== 'todos' && TIMES[timeFiltro]) {
    where.grupo = { in: TIMES[timeFiltro] };
  }
  if (consultor !== 'todos') where.consultor = consultor;

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      protocolo:      true,
      status:         true,
      grupo:          true,
      consultor:      true,
      abertura:       true,
      primeirTramite: true,
      conclusao:      true,
      ultimoTramite:  true,
      slaStatus:      true,
      slaHorasUteis:  true,
    },
    orderBy: { abertura: 'asc' },
  });

  // Helper: ticket foi concluído DENTRO do período selecionado
  const concluidoNoPeriodo = (t: { status: string; conclusao: Date | null }) =>
    t.status === 'Concluído' &&
    (!dataInicio || (t.conclusao !== null && t.conclusao >= dataInicio));

  // ── KPIs globais ──────────────────────────────────────────────────────────
  const total      = tickets.length;
  const concluidos = tickets.filter(concluidoNoPeriodo).length;
  const emAberto   = tickets.filter(t => t.status === 'Em andamento' || t.status === 'Pendente cliente').length;
  const slaDentro  = tickets.filter(t => t.slaStatus === 'dentro').length;
  const slaTotal   = tickets.filter(t => t.slaStatus !== 'pendente').length;
  const slaPercent = slaTotal > 0 ? Math.round((slaDentro / slaTotal) * 100) : 0;
  const horasArr   = tickets.filter(t => t.slaHorasUteis !== null);
  const tmaMedio   = horasArr.length > 0
    ? Math.round(horasArr.reduce((s, t) => s + t.slaHorasUteis!, 0) / horasArr.length * 10) / 10
    : null;

  // ── Por time (apenas tickets com consultor para bater com a soma da tabela) ──
  const timeMap = new Map<string, { total: number; concluidos: number; emAberto: number; slaDentro: number; slaTotal: number }>();
  for (const t of tickets) {
    if (!t.consultor) continue; // exclui sem responsável (mesma regra da tabela)
    const time = grupoToTime(t.grupo);
    if (!timeMap.has(time)) timeMap.set(time, { total: 0, concluidos: 0, emAberto: 0, slaDentro: 0, slaTotal: 0 });
    const tm = timeMap.get(time)!;
    tm.total++;
    if (concluidoNoPeriodo(t)) tm.concluidos++;
    if (t.status === 'Em andamento' || t.status === 'Pendente cliente') tm.emAberto++;
    if (t.slaStatus === 'dentro') { tm.slaDentro++; tm.slaTotal++; }
    if (t.slaStatus === 'fora') tm.slaTotal++;
  }
  const porTime = Array.from(timeMap.entries()).map(([time, v]) => ({
    time,
    total:      v.total,
    concluidos: v.concluidos,
    emAberto:   v.emAberto,
    slaPercent: v.slaTotal > 0 ? Math.round((v.slaDentro / v.slaTotal) * 100) : null,
  })).sort((a, b) => b.total - a.total);

  // ── Por consultor × time (chave composta para evitar distorção) ──────────
  // Um consultor pode ter tickets em múltiplos grupos/times. Agrupamos por
  // (consultor + time) para que os subtotais batem com o total do time.
  const consultorMap = new Map<string, {
    consultor: string; grupo: string; time: string;
    total: number; concluidos: number; emAberto: number;
    slaDentro: number; slaFora: number;
    somaHoras: number; countHoras: number;
    porMes: Record<string, number>;
  }>();

  for (const t of tickets) {
    if (!t.consultor) continue;
    const time  = grupoToTime(t.grupo);
    // Chave composta: consultor + time
    const chave = `${t.consultor}||${time}`;
    if (!consultorMap.has(chave)) {
      consultorMap.set(chave, {
        consultor: t.consultor,
        grupo:     t.grupo,
        time,
        total: 0, concluidos: 0, emAberto: 0,
        slaDentro: 0, slaFora: 0,
        somaHoras: 0, countHoras: 0, porMes: {},
      });
    }
    const c = consultorMap.get(chave)!;
    c.total++;
    if (concluidoNoPeriodo(t)) {
      c.concluidos++;
      // Usa conclusao para agrupar por mês; fallback: ultimoTramite
      const dataRef = t.conclusao ?? (t as any).ultimoTramite;
      if (dataRef) {
        const d   = new Date(dataRef);
        const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        c.porMes[mes] = (c.porMes[mes] ?? 0) + 1;
      }
    }
    if (t.status === 'Em andamento' || t.status === 'Pendente cliente') c.emAberto++;
    if (t.slaStatus === 'dentro') c.slaDentro++;
    if (t.slaStatus === 'fora')   c.slaFora++;
    if (t.slaHorasUteis !== null) { c.somaHoras += t.slaHorasUteis; c.countHoras++; }
  }

  const porConsultor = Array.from(consultorMap.values()).map(c => {
    const slaT       = c.slaDentro + c.slaFora;
    const slaPercent = slaT > 0 ? Math.round((c.slaDentro / slaT) * 100) : null;
    const tmaMedio   = c.countHoras > 0 ? Math.round((c.somaHoras / c.countHoras) * 10) / 10 : null;
    const mesesAtivos = Object.keys(c.porMes).length;
    const mediaMensal = mesesAtivos > 0 ? Math.round((c.concluidos / mesesAtivos) * 10) / 10 : 0;
    return {
      consultor: c.consultor, grupo: c.grupo, time: c.time,
      total: c.total, concluidos: c.concluidos, emAberto: c.emAberto,
      slaPercent, tmaMedio, mediaMensal, porMes: c.porMes,
    };
  }).sort((a, b) => b.total - a.total);

  // ── Série mensal global ───────────────────────────────────────────────────
  // Quando ano específico: todos os 12 meses daquele ano
  // Quando mês específico: todos os 12 meses do ano selecionado
  // Caso contrário: últimos 12 meses a partir de hoje
  const meses: Record<string, { abertos: number; concluidos: number }> = {};
  const ANO_BASE = 2023;
  if (anoEspecifico) {
    for (let m = 0; m < 12; m++) {
      const key = `${anoEspecifico}-${String(m + 1).padStart(2, '0')}`;
      meses[key] = { abertos: 0, concluidos: 0 };
    }
  } else if (periodo === 'tudo') {
    const inicio = new Date(ANO_BASE, 0, 1);
    const fim    = new Date(agora.getFullYear(), agora.getMonth(), 1);
    for (const d = new Date(inicio); d <= fim; d.setMonth(d.getMonth() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses[key] = { abertos: 0, concluidos: 0 };
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d   = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses[key] = { abertos: 0, concluidos: 0 };
    }
  }
  for (const t of tickets) {
    const keyAb = `${t.abertura.getFullYear()}-${String(t.abertura.getMonth() + 1).padStart(2, '0')}`;
    if (meses[keyAb]) meses[keyAb].abertos++;
    if (t.conclusao) {
      const d       = new Date(t.conclusao);
      const keyConc = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (meses[keyConc]) meses[keyConc].concluidos++;
    }
  }
  const serieMensal = Object.entries(meses).map(([mes, v]) => ({ mes, ...v }));

  // ── Listas disponíveis para filtros ───────────────────────────────────────
  const consultores = [...new Set(tickets.map(t => t.consultor))].filter(Boolean).sort();
  const ultimaColeta = await prisma.colecaoLog.findFirst({
    orderBy: { iniciadoEm: 'desc' },
    where: { status: 'concluido' },
    select: { concluidoEm: true, totalTickets: true },
  });

  return NextResponse.json({
    kpis: { total, concluidos, emAberto, slaPercent, tmaMedio },
    porTime,
    porConsultor,
    serieMensal,
    consultores,
    times: Object.keys(TIMES),
    ultimaColeta,
  });
}
