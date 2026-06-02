import { DashboardShell } from '@/components/dashboard-shell';
import UsuariosClient from './usuarios-client';

export const dynamic = 'force-dynamic';

export default function UsuariosPage() {
  return (
    <DashboardShell>
      <UsuariosClient />
    </DashboardShell>
  );
}
