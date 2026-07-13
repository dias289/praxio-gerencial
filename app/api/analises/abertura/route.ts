import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TIMES } from '@/app/api/metrics/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const periodo = sp.get('periodo') ?? 'ano';
  const mes     = sp.get('mes');
  const time    = sp.get('time')    ?? 'todos';
  const agora   = new Date();

  const ANO_BASE = 2023;
  const anoEspecifico = /^\d{4}$/.test(periodo) ? parseInt(periodo) : null;
  const mesEspecifico = mes ? parseInt(mes) : null;

  let dataInicio: Date | null = null;
  let dataFim:    Date | null = null;

  if (anoEspecifico) {
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
    }
  }

  const where: any = {};
  if (time !== 'todos' && TIMES[time]) where.grupo = { in: TIMES[time] };
  if (dataInicio && dataFim) where.abertura = { gte: dataInicio, lt: dataFim };
  else if (dataInicio)       where.abertura = { gte: dataInicio };

  const tickets = await prisma.ticket.findMany({
    where,
    select: { abertura: true, conclusao: true, status: true, grupo: true, modulo: true, cliente: true },
  });

  // ── Série mensal (abertura e conclusão) ───────────────────────────────────
  const meses: Record<string, { abertos: number; concluidos: number }> = {};
  if (anoEspecifico) {
    for (let m = 0; m < 12; m++) {
      meses[`${anoEspecifico}-${String(m + 1).padStart(2, '0')}`] = { abertos: 0, concluidos: 0 };
    }
  } else if (periodo === 'tudo') {
    const ini = new Date(ANO_BASE, 0, 1);
    const fim2 = new Date(agora.getFullYear(), agora.getMonth(), 1);
    for (const d = new Date(ini); d <= fim2; d.setMonth(d.getMonth() + 1)) {
      meses[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = { abertos: 0, concluidos: 0 };
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      meses[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = { abertos: 0, concluidos: 0 };
    }
  }

  for (const t of tickets) {
    const kA = `${new Date(t.abertura).getFullYear()}-${String(new Date(t.abertura).getMonth() + 1).padStart(2, '0')}`;
    if (meses[kA]) meses[kA].abertos++;
    if (t.conclusao) {
      const kC = `${new Date(t.conclusao).getFullYear()}-${String(new Date(t.conclusao).getMonth() + 1).padStart(2, '0')}`;
      if (meses[kC]) meses[kC].concluidos++;
    }
  }
  const serieMensal = Object.entries(meses).map(([mes2, v]) => ({ mes: mes2, ...v }));
  const mediaAb = serieMensal.length > 0
    ? Math.round(serieMensal.reduce((s, m) => s + m.abertos, 0) / serieMensal.length) : 0;
  const mediaConc = serieMensal.length > 0
    ? Math.round(serieMensal.reduce((s, m) => s + m.concluidos, 0) / serieMensal.length) : 0;

  // ── Por módulo ────────────────────────────────────────────────────────────
  const moduloMap = new Map<string, { abertos: number; concluidos: number }>();
  for (const t of tickets) {
    const m = t.modulo || 'Sem módulo';
    if (!moduloMap.has(m)) moduloMap.set(m, { abertos: 0, concluidos: 0 });
    const v = moduloMap.get(m)!;
    v.abertos++;
    if (t.status === 'Concluído') v.concluidos++;
  }
  const porModulo = Array.from(moduloMap.entries())
    .map(([modulo, v]) => ({ modulo, ...v }))
    .sort((a, b) => b.abertos - a.abertos)
    .slice(0, 15);

  // ── Por grupo ─────────────────────────────────────────────────────────────
  const grupoMap = new Map<string, { abertos: number; concluidos: number }>();
  for (const t of tickets) {
    if (!grupoMap.has(t.grupo)) grupoMap.set(t.grupo, { abertos: 0, concluidos: 0 });
    const v = grupoMap.get(t.grupo)!;
    v.abertos++;
    if (t.status === 'Concluído') v.concluidos++;
  }
  const porGrupo = Array.from(grupoMap.entries())
    .map(([grupo, v]) => ({ grupo, ...v }))
    .sort((a, b) => b.abertos - a.abertos);

  // ── Top 10 clientes ───────────────────────────────────────────────────────
  const clienteMap = new Map<string, { abertos: number; concluidos: number }>();
  for (const t of tickets) {
    const c = t.cliente?.trim() || 'Sem cliente';
    if (!clienteMap.has(c)) clienteMap.set(c, { abertos: 0, concluidos: 0 });
    const v = clienteMap.get(c)!;
    v.abertos++;
    if (t.status === 'Concluído') v.concluidos++;
  }
  const topClientes = Array.from(clienteMap.entries())
    .filter(([n]) => n !== 'Sem cliente')
    .map(([cliente, v]) => ({ cliente, ...v }))
    .sort((a, b) => b.abertos - a.abertos)
    .slice(0, 10);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalAbertos    = tickets.length;
  const totalConcluidos = tickets.filter(t => t.status === 'Concluído').length;
  const mesComMais = serieMensal.reduce((max, m) => m.abertos > max.abertos ? m : max, { mes: '—', abertos: 0, concluidos: 0 });
  const lastIdx = serieMensal.length - 1;
  const variacaoAb = lastIdx >= 1 && serieMensal[lastIdx - 1].abertos > 0
    ? Math.round(((serieMensal[lastIdx].abertos - serieMensal[lastIdx - 1].abertos) / serieMensal[lastIdx - 1].abertos) * 100) : 0;

  return NextResponse.json({
    kpis: { totalAbertos, totalConcluidos, mediaAb, mediaConc, mesComMais: mesComMais.mes, variacaoAb },
    serieMensal, porModulo, porGrupo, topClientes,
  });
}
