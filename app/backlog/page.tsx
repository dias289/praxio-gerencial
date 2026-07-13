import { DashboardShell } from '@/components/dashboard-shell';
import BacklogClient from './backlog-client';
export const dynamic = 'force-dynamic';
export default function BacklogPage() {
  return <DashboardShell active="/backlog"><BacklogClient /></DashboardShell>;
}
