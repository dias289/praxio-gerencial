import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TIMES } from '@/app/api/metrics/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const periodo = sp.get('periodo') ?? 'ano';
  const time    = sp.get('time')    ?? 'todos';
  const agora   = new Date();

  const where: any = {};
  if (time !== 'todos' && TIMES[time]) where.grupo = { in: TIMES[time] };

  const tickets = await prisma.ticket.findMany({
    where,
    select: { cliente: true, status: true, slaStatus: true, slaHorasUteis: true, modulo: true, abertura: true, conclusao: true },
  });

  // ── Agrupa por cliente ────────────────────────────────────────────────────
  const clienteMap = new Map<string, {
    total: number; concluidos: number; emAberto: number;
    slaDentro: number; slaFora: number; modulos: Record<string, number>;
    agingTotal: number; agingCount: number;
  }>();

  for (const t of tickets) {
    const nome = t.cliente?.trim() || 'Sem cliente';
    if (!clienteMap.has(nome)) clienteMap.set(nome, {
      total: 0, concluidos: 0, emAberto: 0, slaDentro: 0, slaFora: 0,
      modulos: {}, agingTotal: 0, agingCount: 0,
    });
    const c = clienteMap.get(nome)!;
    c.total++;
    if (t.status === 'Concluído') c.concluidos++;
    if (t.status === 'Em andamento' || t.status === 'Pendente cliente') {
      c.emAberto++;
      const d = (agora.getTime() - new Date(t.abertura).getTime()) / 86_400_000;
      c.agingTotal += d;
      c.agingCount++;
    }
    if (t.slaStatus === 'dentro') c.slaDentro++;
    if (t.slaStatus === 'fora')   c.slaFora++;
    if (t.modulo) c.modulos[t.modulo] = (c.modulos[t.modulo] ?? 0) + 1;
  }

  const clientes = Array.from(clienteMap.entries())
    .filter(([nome]) => nome !== 'Sem cliente')
    .map(([cliente, v]) => {
      const slaT = v.slaDentro + v.slaFora;
      const modPred = Object.entries(v.modulos).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      return {
        cliente,
        total:      v.total,
        concluidos: v.concluidos,
        emAberto:   v.emAberto,
        slaPercent: slaT > 0 ? Math.round((v.slaDentro / slaT) * 100) : null,
        agingMedio: v.agingCount > 0 ? Math.round(v.agingTotal / v.agingCount * 10) / 10 : null,
        moduloPredominante: modPred,
      };
    })
    .sort((a, b) => b.total - a.total);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const total = clientes.length;
  const comAbertos = clientes.filter(c => c.emAberto > 0).length;
  const mediaPorCliente = total > 0
    ? Math.round(clientes.reduce((s, c) => s + c.total, 0) / total * 10) / 10 : 0;
  const maiorCliente = clientes[0]?.cliente ?? '—';

  // ── Top 20 por volume ─────────────────────────────────────────────────────
  const top20volume  = clientes.slice(0, 20);
  const top10abertos = [...clientes].sort((a, b) => b.emAberto - a.emAberto).slice(0, 10);

  return NextResponse.json({
    kpis: { total, comAbertos, mediaPorCliente, maiorCliente },
    clientes,
    top20volume,
    top10abertos,
  });
}
