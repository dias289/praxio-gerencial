import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function main() {
  // Tickets por mês de CONCLUSÃO em 2025
  const tickets2025 = await prisma.ticket.findMany({
    where: {
      status: 'Concluído',
      conclusao: { gte: new Date('2025-01-01'), lt: new Date('2026-01-01') },
    },
    select: { conclusao: true, grupo: true },
  });

  const porMes: Record<string, number> = {};
  for (const t of tickets2025) {
    const d = new Date(t.conclusao!);
    const mes = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    porMes[mes] = (porMes[mes] ?? 0) + 1;
  }

  console.log(`\n=== Tickets CONCLUÍDOS por mês em 2025 (total: ${tickets2025.length}) ===`);
  for (const mes of Object.keys(porMes).sort()) {
    console.log(`  ${mes}: ${porMes[mes]}`);
  }

  // Tickets por mês de ABERTURA em 2025
  const abertos2025 = await prisma.ticket.findMany({
    where: { abertura: { gte: new Date('2025-01-01'), lt: new Date('2026-01-01') } },
    select: { abertura: true },
  });

  const porMesAb: Record<string, number> = {};
  for (const t of abertos2025) {
    const d = new Date(t.abertura);
    const mes = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    porMesAb[mes] = (porMesAb[mes] ?? 0) + 1;
  }

  console.log(`\n=== Tickets ABERTOS por mês em 2025 (total: ${abertos2025.length}) ===`);
  for (const mes of Object.keys(porMesAb).sort()) {
    console.log(`  ${mes}: ${porMesAb[mes]}`);
  }

  // Ticket mais antigo no banco
  const maisAntigo = await prisma.ticket.findFirst({ orderBy: { abertura: 'asc' }, select: { abertura: true, protocolo: true } });
  console.log(`\nTicket mais antigo no banco: ${maisAntigo?.protocolo} — ${maisAntigo?.abertura?.toLocaleDateString('pt-BR')}`);

  await prisma.$disconnect();
}

main().catch(console.error);
