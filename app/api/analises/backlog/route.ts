import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TIMES } from '@/app/api/metrics/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp   = req.nextUrl.searchParams;
  const time = sp.get('time') ?? 'todos';

  const where: any = { status: { in: ['Em andamento', 'Pendente cliente'] } };
  if (time !== 'todos' && TIMES[time]) where.grupo = { in: TIMES[time] };

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      protocolo: true, consultor: true, grupo: true,
      abertura: true, primeirTramite: true, slaStatus: true, status: true,
    },
  });

  const agora  = new Date();

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const total  = tickets.length;
  const semSla = tickets.filter(t => !t.primeirTramite).length;
  // Alinhado ao SLA oficial: "em risco" = tempo útil sob o time já passou da meta
  // (slaStatus === 'fora'), o mesmo conceito da Visão Geral.
  const emRisco = tickets.filter(t => t.slaStatus === 'fora').length;
  const aging  = tickets.map(t =>
    (agora.getTime() - new Date(t.abertura).getTime()) / 86_400_000
  );
  const agingMedio = aging.length > 0
    ? Math.round(aging.reduce((s, v) => s + v, 0) / aging.length * 10) / 10 : 0;

  // ── Faixas de aging ───────────────────────────────────────────────────────
  const faixas = { '0-7': 0, '8-30': 0, '31-60': 0, '60+': 0 };
  for (const d of aging) {
    if      (d <= 7)  faixas['0-7']++;
    else if (d <= 30) faixas['8-30']++;
    else if (d <= 60) faixas['31-60']++;
    else              faixas['60+']++;
  }

  // ── Por grupo ─────────────────────────────────────────────────────────────
  const grupoMap = new Map<string, { total: number; semSla: number; emRisco: number; agingTotal: number }>();
  for (const t of tickets) {
    if (!grupoMap.has(t.grupo)) grupoMap.set(t.grupo, { total: 0, semSla: 0, emRisco: 0, agingTotal: 0 });
    const g = grupoMap.get(t.grupo)!;
    g.total++;
    const d = (agora.getTime() - new Date(t.abertura).getTime()) / 86_400_000;
    g.agingTotal += d;
    if (!t.primeirTramite) g.semSla++;
    if (t.slaStatus === 'fora') g.emRisco++;
  }
  const porGrupo = Array.from(grupoMap.entries())
    .map(([grupo, v]) => ({
      grupo, total: v.total, semSla: v.semSla, emRisco: v.emRisco,
      agingMedio: Math.round(v.agingTotal / v.total * 10) / 10,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Por consultor ─────────────────────────────────────────────────────────
  const consultorMap = new Map<string, { grupo: string; total: number; semSla: number; emRisco: number; agingTotal: number }>();
  for (const t of tickets) {
    if (!t.consultor) continue;
    const key = t.consultor;
    if (!consultorMap.has(key)) consultorMap.set(key, { grupo: t.grupo, total: 0, semSla: 0, emRisco: 0, agingTotal: 0 });
    const c = consultorMap.get(key)!;
    c.total++;
    const d = (agora.getTime() - new Date(t.abertura).getTime()) / 86_400_000;
    c.agingTotal += d;
    if (!t.primeirTramite) c.semSla++;
    if (t.slaStatus === 'fora') c.emRisco++;
  }
  const porConsultor = Array.from(consultorMap.entries())
    .map(([consultor, v]) => ({
      consultor, grupo: v.grupo, total: v.total, semSla: v.semSla, emRisco: v.emRisco,
      agingMedio: Math.round(v.agingTotal / v.total * 10) / 10,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Evolução últimos 12 meses (tickets abertos em aberto naquele mês) ─────
  const evolucao: { mes: string; abertos: number; concluidos: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const abertosNomes = await prisma.ticket.count({
      where: { abertura: { gte: d, lt: new Date(d.getFullYear(), d.getMonth() + 1, 1) } },
    });
    const concluidosNomes = await prisma.ticket.count({
      where: { conclusao: { gte: d, lt: new Date(d.getFullYear(), d.getMonth() + 1, 1) } },
    });
    evolucao.push({ mes: key, abertos: abertosNomes, concluidos: concluidosNomes });
  }

  return NextResponse.json({ kpis: { total, agingMedio, semSla, emRisco }, faixas, porGrupo, porConsultor, evolucao });
}
