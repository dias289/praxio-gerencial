/**
 * Diagnóstico das métricas de análise — compara com Power BI
 * Uso: npx tsx scripts/debug-analises.ts
 */
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();
const agora  = new Date();

async function main() {
  // ── BACKLOG ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('BACKLOG (tickets em aberto AGORA)');
  console.log('═══════════════════════════════════════════');

  const backlog = await prisma.ticket.findMany({
    where: { status: { in: ['Em andamento', 'Pendente cliente'] } },
    select: { grupo: true, consultor: true, abertura: true, primeirTramite: true, slaStatus: true },
  });

  console.log(`Total em aberto: ${backlog.length}`);
  console.log(`  Em andamento:      ${backlog.filter(t => t.status === 'Em andamento').length}`);
  console.log(`  Pendente cliente:  ${backlog.filter(t => t.status === 'Pendente cliente').length}`);
  console.log(`  Sem primeirTramite: ${backlog.filter(t => !t.primeirTramite).length}`);

  const agingDias = backlog.map(t => (agora.getTime() - new Date(t.abertura).getTime()) / 86_400_000);
  const agingMedio = agingDias.length > 0 ? (agingDias.reduce((s,v) => s+v, 0) / agingDias.length).toFixed(1) : 0;
  console.log(`  Aging médio: ${agingMedio} dias`);

  // Por grupo
  const grupoBacklog: Record<string, number> = {};
  backlog.forEach(t => { grupoBacklog[t.grupo] = (grupoBacklog[t.grupo] ?? 0) + 1; });
  console.log('\n  Por grupo:');
  Object.entries(grupoBacklog).sort((a,b) => b[1]-a[1]).forEach(([g,n]) => console.log(`    ${g.padEnd(20)}: ${n}`));

  // ── SLA ───────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('SLA — comparação por período');
  console.log('═══════════════════════════════════════════');

  const periodos = [
    { label: 'Este mês',    ini: new Date(agora.getFullYear(), agora.getMonth(), 1) },
    { label: 'Este ano (2026)', ini: new Date(2026, 0, 1) },
    { label: 'Ano 2025',    ini: new Date(2025, 0, 1), fim: new Date(2026, 0, 1) },
    { label: 'Todo histórico', ini: null },
  ];

  for (const p of periodos) {
    const where: any = { slaStatus: { not: 'pendente' } };
    if (p.ini) where.abertura = p.fim ? { gte: p.ini, lt: p.fim } : { gte: p.ini };
    const sla = await prisma.ticket.findMany({ where, select: { slaStatus: true, slaHorasUteis: true } });
    const dentro = sla.filter(t => t.slaStatus === 'dentro').length;
    const fora   = sla.filter(t => t.slaStatus === 'fora').length;
    const pct    = sla.length > 0 ? Math.round(dentro / sla.length * 100) : 0;
    const horas  = sla.filter(t => t.slaHorasUteis != null).map(t => t.slaHorasUteis!);
    const tma    = horas.length > 0 ? (horas.reduce((s,v) => s+v, 0) / horas.length).toFixed(1) : '—';
    console.log(`\n  ${p.label}`);
    console.log(`    Total c/SLA: ${sla.length}  |  Dentro: ${dentro}  |  Fora: ${fora}  |  %SLA: ${pct}%  |  TMA: ${tma}h`);
  }

  // ── CLIENTES ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('CLIENTES — total por período');
  console.log('═══════════════════════════════════════════');

  const clientesPeriodos = [
    { label: 'Este ano (2026)', ini: new Date(2026, 0, 1), fim: null },
    { label: 'Ano 2025',        ini: new Date(2025, 0, 1), fim: new Date(2026, 0, 1) },
    { label: 'Todo histórico',  ini: null, fim: null },
  ];

  for (const p of clientesPeriodos) {
    const where: any = {};
    if (p.ini) where.abertura = p.fim ? { gte: p.ini, lt: p.fim } : { gte: p.ini };
    const rows = await prisma.ticket.findMany({ where, select: { cliente: true } });
    const uniq = new Set(rows.map(r => r.cliente?.trim()).filter(Boolean));
    console.log(`  ${p.label}: ${rows.length} tickets, ${uniq.size} clientes únicos`);
  }

  // Top 10 clientes no ano atual
  const tickets2026 = await prisma.ticket.findMany({
    where: { abertura: { gte: new Date(2026, 0, 1) } },
    select: { cliente: true },
  });
  const clienteMap: Record<string, number> = {};
  tickets2026.forEach(t => { const c = t.cliente?.trim() || 'Sem cliente'; clienteMap[c] = (clienteMap[c] ?? 0) + 1; });
  console.log('\n  Top 10 clientes (2026):');
  Object.entries(clienteMap).sort((a,b) => b[1]-a[1]).slice(0,10).forEach(([c,n]) => console.log(`    ${c.slice(0,40).padEnd(40)}: ${n}`));

  // ── ABERTURA ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('ABERTURA — total por período');
  console.log('═══════════════════════════════════════════');

  const abPeriodos = [
    { label: 'Este mês',       ini: new Date(agora.getFullYear(), agora.getMonth(), 1) },
    { label: 'Este ano (2026)',ini: new Date(2026, 0, 1) },
    { label: 'Ano 2025',      ini: new Date(2025, 0, 1), fim: new Date(2026, 0, 1) },
  ];

  for (const p of abPeriodos) {
    const where: any = {};
    if (p.ini) where.abertura = (p as any).fim ? { gte: p.ini, lt: (p as any).fim } : { gte: p.ini };
    const total = await prisma.ticket.count({ where });
    const conc  = await prisma.ticket.count({ where: { ...where, status: 'Concluído' } });
    console.log(`  ${p.label}: ${total} abertos / ${conc} concluídos`);
  }

  // Top 10 módulos no ano atual
  const modulos = await prisma.ticket.groupBy({
    by: ['modulo'],
    where: { abertura: { gte: new Date(2026, 0, 1) } },
    _count: { protocolo: true },
    orderBy: { _count: { protocolo: 'desc' } },
  });
  console.log('\n  Top 10 módulos (2026):');
  modulos.slice(0,10).forEach(m => console.log(`    ${(m.modulo||'Sem módulo').slice(0,40).padEnd(40)}: ${m._count.protocolo}`));

  await prisma.$disconnect();
}

main().catch(console.error);
