import { DashboardShell } from '@/components/dashboard-shell';
import SlaClient from './sla-client';
export const dynamic = 'force-dynamic';
export default function SlaPage() {
  return <DashboardShell active="/sla"><SlaClient /></DashboardShell>;
}
