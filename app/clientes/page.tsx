import { DashboardShell } from '@/components/dashboard-shell';
import ClientesClient from './clientes-client';
export const dynamic = 'force-dynamic';
export default function ClientesPage() {
  return <DashboardShell active="/clientes"><ClientesClient /></DashboardShell>;
}
