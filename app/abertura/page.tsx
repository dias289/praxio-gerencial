import { DashboardShell } from '@/components/dashboard-shell';
import AberturaClient from './abertura-client';
export const dynamic = 'force-dynamic';
export default function AberturaPage() {
  return <DashboardShell active="/abertura"><AberturaClient /></DashboardShell>;
}
