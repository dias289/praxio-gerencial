import { Suspense } from 'react';
import { DashboardShell } from '@/components/dashboard-shell';
import { DashboardClient } from '@/components/dashboard-client';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <DashboardShell>
      <Suspense fallback={<div className="p-8 text-center text-gray-500">Carregando métricas...</div>}>
        <DashboardClient />
      </Suspense>
    </DashboardShell>
  );
}
