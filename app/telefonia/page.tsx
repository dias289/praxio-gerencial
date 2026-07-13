import { DashboardShell } from '@/components/dashboard-shell';
import TelefoniaClient from './telefonia-client';

export const dynamic = 'force-dynamic';

export default function TelefoniaPage() {
  return (
    <DashboardShell active="/telefonia">
      <TelefoniaClient />
    </DashboardShell>
  );
}
