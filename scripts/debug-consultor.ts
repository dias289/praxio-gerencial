import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function main() {
  // Lista todos os consultores únicos no banco
  const consultores = await prisma.ticket.groupBy({
    by: ['consultor'],
    _count: { protocolo: true },
    orderBy: { _count: { protocolo: 'desc' } },
  });

  console.log('\n=== Consultores no banco ===');
  consultores.forEach(c => {
    const nome = c.consultor || '(vazio)';
    console.log(`  "${nome}" → ${c._count.protocolo} tickets`);
  });

  // Busca especificamente Rafael
  const rafael = consultores.filter(c =>
    c.consultor?.toLowerCase().includes('rafael')
  );
  console.log('\n=== Registros com "rafael" ===');
  console.log(JSON.stringify(rafael, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
