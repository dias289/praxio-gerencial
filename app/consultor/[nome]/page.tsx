import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { DashboardShell } from '@/components/dashboard-shell';
import { ConsultorDetailClient } from '@/components/consultor-detail-client';

export const dynamic = 'force-dynamic';

export default async function ConsultorPage({ params }: { params: { nome: string } }) {
  const nome = decodeURIComponent(params.nome);

  // Busca todos os tickets do consultor
  const tickets = await prisma.ticket.findMany({
    where: { consultor: { contains: nome, mode: 'insensitive' } },
    select: {
      protocolo: true, assunto: true, status: true, grupo: true,
      cliente: true, abertura: true, conclusao: true,
      slaStatus: true, slaHorasUteis: true,
    },
    orderBy: { abertura: 'desc' },
  });

  if (tickets.length === 0) notFound();

  return (
    <DashboardShell>
      <ConsultorDetailClient nome={nome} tickets={tickets as any[]} />
    </DashboardShell>
  );
}
