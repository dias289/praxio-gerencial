import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function main() {
  // ── Diagnóstico de TODOS os consultores ───────────────────────────────────
  const todos = await prisma.ticket.groupBy({
    by: ['consultor'],
    where: { status: 'Concluído' },
    _count: { protocolo: true },
    orderBy: { _count: { protocolo: 'desc' } },
  });

  console.log('\n=== TODOS OS CONSULTORES — Concluídos (com vs sem data de conclusão) ===');
  let totalSemData = 0;
  for (const row of todos) {
    const c = row.consultor;
    if (!c) continue;
    const semData = await prisma.ticket.count({ where: { consultor: c, status: 'Concluído', conclusao: null } });
    const total   = row._count.protocolo;
    const pct     = Math.round((semData / total) * 100);
    if (semData > 0) {
      console.log(`  ${c.padEnd(25)} total=${total} semData=${semData} (${pct}%)`);
      totalSemData += semData;
    }
  }
  console.log(`\nTotal sem data de conclusão (todos): ${totalSemData}`);

  // ── Diagnóstico detalhado do FELIPE.DIAS ──────────────────────────────────
  const consultor = 'FELIPE.DIAS';

  // Total de concluídos
  const total = await prisma.ticket.count({
    where: { consultor, status: 'Concluído' },
  });

  // Concluídos COM data de conclusão
  const comData = await prisma.ticket.count({
    where: { consultor, status: 'Concluído', conclusao: { not: null } },
  });

  // Concluídos SEM data de conclusão
  const semData = total - comData;

  console.log(`\n=== ${consultor} ===`);
  console.log(`Total concluídos:          ${total}`);
  console.log(`Com data de conclusão:     ${comData}`);
  console.log(`Sem data de conclusão:     ${semData} ← tickets invisíveis no mês`);

  // Contagem por mês (usando conclusao)
  const ticketsComData = await prisma.ticket.findMany({
    where: { consultor, status: 'Concluído', conclusao: { not: null } },
    select: { protocolo: true, conclusao: true, ultimoTramite: true },
  });

  const porMes: Record<string, number> = {};
  for (const t of ticketsComData) {
    const d   = new Date(t.conclusao!);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
    porMes[mes] = (porMes[mes] ?? 0) + 1;
  }

  console.log('\nConcluídos por mês (com data):');
  Object.entries(porMes).sort().slice(-12).forEach(([mes, n]) => {
    console.log(`  ${mes}: ${n}`);
  });

  // Amostra dos sem data (verificar se têm ultimoTramite)
  const semDataSample = await prisma.ticket.findMany({
    where: { consultor, status: 'Concluído', conclusao: null },
    select: { protocolo: true, ultimoTramite: true, abertura: true },
    take: 5,
  });

  console.log('\nAmostra sem data de conclusão:');
  semDataSample.forEach(t => {
    console.log(`  ${t.protocolo} | ultimoTramite: ${t.ultimoTramite?.toLocaleDateString('pt-BR') ?? 'null'} | abertura: ${t.abertura.toLocaleDateString('pt-BR')}`);
  });

  // Contagem usando ultimoTramite como fallback
  const todosConcluidos = await prisma.ticket.findMany({
    where: { consultor, status: 'Concluído' },
    select: { conclusao: true, ultimoTramite: true },
  });

  const porMesFallback: Record<string, number> = {};
  for (const t of todosConcluidos) {
    const dataRef = t.conclusao ?? t.ultimoTramite;
    if (!dataRef) continue;
    const d   = new Date(dataRef);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
    porMesFallback[mes] = (porMesFallback[mes] ?? 0) + 1;
  }

  console.log('\nConcluídos por mês (com fallback ultimoTramite):');
  Object.entries(porMesFallback).sort().slice(-12).forEach(([mes, n]) => {
    console.log(`  ${mes}: ${n}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
