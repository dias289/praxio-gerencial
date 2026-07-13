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

// "Em aberto" (backlog) = os status que aparecem em "Meus itens" no portal.
// Snapshot do estado atual — independente do período selecionado.
const STATUS_ABERTOS = ['Em andamento', 'Pendente cliente'];

/**
 * GET /api/metrics
 *   periodo   = "mes" | "trimestre" | "ano" | "tudo" | "2023" | ...
 *   mes       = "1".."12"
 *   time      = "Administrativo" | "Operacional" | "todos"
 *   consultor = nome | "todos"
 *
 * Fluxo (volume, concluídos, série mensal) respeita o período.
 * Estoque (em aberto, SLA do backlog, TMA) é SEMPRE o estado atual (snapshot).
 */
export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const periodo    = sp.get('periodo')   ?? 'tudo';
  const mesParam   = sp.get('mes');
  const timeFiltro = sp.get('time')    ?? 'todos';
  const consultor  = sp.get('consultor') ?? 'todos';

  const agora = new Date();
  let dataInicio: Date | null = null;
  let dataFim:    Date | null = null;

  // Intervalo personalizado por dia (De/Até) — tem prioridade sobre os presets.
  const deParam = sp.get('de'); const ateParam = sp.get('ate');
  const rangeValido = !!(deParam && ateParam && /^\d{4}-\d{2}-\d{2}$/.test(deParam) && /^\d{4}-\d{2}-\d{2}$/.test(ateParam));
  const anoEspecifico = /^\d{4}$/.test(periodo) ? parseInt(periodo) : null;
  const mesEspecifico = mesParam ? parseInt(mesParam) : null;

  if (rangeValido) {
    const [y1, m1, d1] = (deParam as string).split('-').map(Number);
    const [y2, m2, d2] = (ateParam as string).split('-').map(Number);
    dataInicio = new Date(y1, m1 - 1, d1);
    dataFim    = new Date(y2, m2 - 1, d2 + 1); // exclusivo: inclui o dia final
  } else if (anoEspecifico) {
    if (mesEspecifico && mesEspecifico >= 1 && mesEspecifico <= 12) {
      dataInicio = new Date(anoEspecifico, mesEspecifico - 1, 1);
      dataFim    = new Date(anoEspecifico, mesEspecifico,     1);
    } else {
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

  // Filtro de time/consultor (comum aos dois conjuntos)
  const filtroTimeConsultor: any = {};
  if (timeFiltro !== 'todos' && TIMES[timeFiltro]) filtroTimeConsultor.grupo = { in: TIMES[timeFiltro] };
  if (consultor !== 'todos') filtroTimeConsultor.consultor = consultor;

  // ── FLUXO: tickets do período (volume, concluídos, série) ──────────────────
  const where: any = { ...filtroTimeConsultor };
  if (dataInicio && dataFim) {
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
  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      protocolo: true, status: true, grupo: true, consultor: true,
      abertura: true, conclusao: true, ultimoTramite: true,
    },
    orderBy: { abertura: 'asc' },
  });

  // ── ESTOQUE: tickets em aberto AGORA (snapshot, sem período) ────────────────
  const abertos = await prisma.ticket.findMany({
    where: { ...filtroTimeConsultor, status: { in: STATUS_ABERTOS } },
    select: { grupo: true, consultor: true, slaStatus: true, slaHorasUteis: true },
  });

  const concluidoNoPeriodo = (t: { status: string; conclusao: Date | null }) =>
    t.status === 'Concluído' &&
    (!dataInicio || (t.conclusao !== null && t.conclusao >= dataInicio)) &&
    (!dataFim   || (t.conclusao !== null && t.conclusao <  dataFim));

  // ── KPIs globais ───────────────────────────────────────────────────────────
  const total      = tickets.length;
  const concluidos = tickets.filter(concluidoNoPeriodo).length;
  const emAberto   = abertos.length;
  const slaDentro  = abertos.filter(t => t.slaStatus === 'dentro').length;
  const slaTotal   = abertos.filter(t => t.slaStatus !== 'pendente').length;
  const slaPercent = slaTotal > 0 ? Math.round((slaDentro / slaTotal) * 100) : 0;
  const horasArr   = abertos.filter(t => t.slaHorasUteis !== null);
  const tmaMedio   = horasArr.length > 0
    ? Math.round(horasArr.reduce((s, t) => s + t.slaHorasUteis!, 0) / horasArr.length * 10) / 10
    : null;

  // ── Por time ────────────────────────────────────────────────────────────────
  const timeFlow = new Map<string, { total: number; concluidos: number }>();
  for (const t of tickets) {
    if (!t.consultor) continue;
    const time = grupoToTime(t.grupo);
    const tm = timeFlow.get(time) ?? { total: 0, concluidos: 0 };
    tm.total++; if (concluidoNoPeriodo(t)) tm.concluidos++;
    timeFlow.set(time, tm);
  }
  const timeSnap = new Map<string, { emAberto: number; slaDentro: number; slaTotal: number }>();
  for (const t of abertos) {
    if (!t.consultor) continue;
    const time = grupoToTime(t.grupo);
    const tm = timeSnap.get(time) ?? { emAberto: 0, slaDentro: 0, slaTotal: 0 };
    tm.emAberto++;
    if (t.slaStatus === 'dentro') { tm.slaDentro++; tm.slaTotal++; }
    else if (t.slaStatus === 'fora') tm.slaTotal++;
    timeSnap.set(time, tm);
  }
  const porTime = [...new Set([...timeFlow.keys(), ...timeSnap.keys()])].map(time => {
    const f = timeFlow.get(time) ?? { total: 0, concluidos: 0 };
    const s = timeSnap.get(time) ?? { emAberto: 0, slaDentro: 0, slaTotal: 0 };
    return {
      time, total: f.total, concluidos: f.concluidos, emAberto: s.emAberto,
      slaPercent: s.slaTotal > 0 ? Math.round((s.slaDentro / s.slaTotal) * 100) : null,
    };
  }).sort((a, b) => b.total - a.total);

  // ── Por consultor × time ─────────────────────────────────────────────────────
  type Flow = { consultor: string; grupo: string; time: string; total: number; concluidos: number; porMes: Record<string, number> };
  const consFlow = new Map<string, Flow>();
  for (const t of tickets) {
    if (!t.consultor) continue;
    const time  = grupoToTime(t.grupo);
    const chave = `${t.consultor}||${time}`;
    const c = consFlow.get(chave) ?? { consultor: t.consultor, grupo: t.grupo, time, total: 0, concluidos: 0, porMes: {} };
    c.total++;
    if (concluidoNoPeriodo(t)) {
      c.concluidos++;
      const dataRef = t.conclusao ?? t.ultimoTramite;
      if (dataRef) {
        const d = new Date(dataRef);
        const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        c.porMes[mes] = (c.porMes[mes] ?? 0) + 1;
      }
    }
    consFlow.set(chave, c);
  }
  type Snap = { grupo: string; emAberto: number; slaDentro: number; slaFora: number; somaHoras: number; countHoras: number };
  const consSnap = new Map<string, Snap>();
  for (const t of abertos) {
    if (!t.consultor) continue;
    const time  = grupoToTime(t.grupo);
    const chave = `${t.consultor}||${time}`;
    const c = consSnap.get(chave) ?? { grupo: t.grupo, emAberto: 0, slaDentro: 0, slaFora: 0, somaHoras: 0, countHoras: 0 };
    c.emAberto++;
    if (t.slaStatus === 'dentro') c.slaDentro++;
    if (t.slaStatus === 'fora')   c.slaFora++;
    if (t.slaHorasUteis !== null) { c.somaHoras += t.slaHorasUteis; c.countHoras++; }
    consSnap.set(chave, c);
  }
  const porConsultor = [...new Set([...consFlow.keys(), ...consSnap.keys()])].map(chave => {
    const f = consFlow.get(chave);
    const s = consSnap.get(chave);
    const [consultor, time] = chave.split('||');
    const grupo = f?.grupo ?? s?.grupo ?? '';
    const total = f?.total ?? 0;
    const concluidos = f?.concluidos ?? 0;
    const slaT = (s?.slaDentro ?? 0) + (s?.slaFora ?? 0);
    const mesesAtivos = f ? Object.keys(f.porMes).length : 0;
    return {
      consultor, grupo, time,
      total, concluidos, emAberto: s?.emAberto ?? 0,
      slaPercent: slaT > 0 ? Math.round(((s?.slaDentro ?? 0) / slaT) * 100) : null,
      tmaMedio: (s && s.countHoras > 0) ? Math.round((s.somaHoras / s.countHoras) * 10) / 10 : null,
      mediaMensal: mesesAtivos > 0 ? Math.round((concluidos / mesesAtivos) * 10) / 10 : 0,
      porMes: f?.porMes ?? {},
    };
  }).sort((a, b) => b.total - a.total);

  // ── Série mensal global (fluxo) ───────────────────────────────────────────────
  const meses: Record<string, { abertos: number; concluidos: number }> = {};
  const ANO_BASE = 2023;
  if (rangeValido && dataInicio && dataFim) {
    const cur = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1);
    const ultimo = new Date(dataFim.getTime() - 86_400_000);
    const fimM = new Date(ultimo.getFullYear(), ultimo.getMonth(), 1);
    for (; cur <= fimM; cur.setMonth(cur.getMonth() + 1))
      meses[`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`] = { abertos: 0, concluidos: 0 };
  } else if (anoEspecifico) {
    for (let m = 0; m < 12; m++) meses[`${anoEspecifico}-${String(m + 1).padStart(2, '0')}`] = { abertos: 0, concluidos: 0 };
  } else if (periodo === 'tudo') {
    const inicio = new Date(ANO_BASE, 0, 1);
    const fim    = new Date(agora.getFullYear(), agora.getMonth(), 1);
    for (const d = new Date(inicio); d <= fim; d.setMonth(d.getMonth() + 1))
      meses[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = { abertos: 0, concluidos: 0 };
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      meses[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = { abertos: 0, concluidos: 0 };
    }
  }
  for (const t of tickets) {
    const keyAb = `${t.abertura.getFullYear()}-${String(t.abertura.getMonth() + 1).padStart(2, '0')}`;
    if (meses[keyAb]) meses[keyAb].abertos++;
    if (t.conclusao) {
      const d = new Date(t.conclusao);
      const keyConc = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (meses[keyConc]) meses[keyConc].concluidos++;
    }
  }
  const serieMensal = Object.entries(meses).map(([mes, v]) => ({ mes, ...v }));

  // ── Comparativo ANO A ANO (concluídos por mês/ano) + crescimento YTD ──────────
  // Usa TODOS os concluídos (respeitando time/consultor), independente do período.
  const concluidosAll = await prisma.ticket.findMany({
    where: { ...filtroTimeConsultor, status: 'Concluído', conclusao: { not: null } },
    select: { conclusao: true },
  });
  const yoy: Record<number, number[]> = {};
  const anosSet = new Set<number>();
  for (const t of concluidosAll) {
    const d = t.conclusao as Date; const y = d.getFullYear(), m = d.getMonth();
    anosSet.add(y); (yoy[y] ??= new Array(12).fill(0))[m]++;
  }
  const anosT = [...anosSet].sort();
  const NOMES_MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const anoAano = NOMES_MES.map((nome, m) => {
    const linha: Record<string, number | string> = { mes: nome };
    for (const y of anosT) linha[String(y)] = yoy[y]?.[m] ?? 0;
    return linha;
  });
  // Crescimento comparável: Jan..mês atual, ano vs ano anterior
  const mesAtual = agora.getMonth();
  const ytd = (y: number) => (yoy[y] ?? []).slice(0, mesAtual + 1).reduce((s, v) => s + v, 0);
  const anoResumo = anosT.map((y, i) => {
    const anterior = i > 0 ? anosT[i - 1] : null;
    const ytdY = ytd(y), ytdA = anterior !== null ? ytd(anterior) : 0;
    return {
      ano: y,
      total: (yoy[y] ?? []).reduce((s, v) => s + v, 0),
      ytd: ytdY,
      cresc: (anterior !== null && ytdA > 0) ? Math.round((ytdY - ytdA) / ytdA * 100) : null,
    };
  });

  const consultores = [...new Set(tickets.map(t => t.consultor))].filter(Boolean).sort();
  const ultimaColeta = await prisma.colecaoLog.findFirst({
    orderBy: { iniciadoEm: 'desc' },
    where: { status: 'concluido' },
    select: { concluidoEm: true, totalTickets: true },
  });

  return NextResponse.json({
    kpis: { total, concluidos, emAberto, slaPercent, tmaMedio },
    porTime, porConsultor, serieMensal, consultores,
    anoAano, anoResumo, mesAtual,
    times: Object.keys(TIMES), ultimaColeta,
  });
}
