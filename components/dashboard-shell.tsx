import Link from 'next/link';
import ThemeToggle from '@/components/theme-toggle';
import { BarChart3, Users, Clock, TrendingUp, ShieldCheck, Building, Phone } from 'lucide-react';

const NAV = [
  { href: '/',          label: 'Visão Geral', icon: BarChart3 },
  { href: '/backlog',   label: 'Backlog',     icon: Clock },
  { href: '/abertura',  label: 'Abertura',    icon: TrendingUp },
  { href: '/sla',       label: 'SLA',         icon: ShieldCheck },
  { href: '/clientes',  label: 'Clientes',    icon: Building },
  { href: '/telefonia', label: 'Telefonia',   icon: Phone },
];

export function DashboardShell({ children, active }: { children: React.ReactNode; active?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
                  <BarChart3 className="h-5 w-5 text-white" />
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">Dashboard Gerencial</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">Suporte Praxio</p>
                </div>
              </Link>
              <nav className="flex items-center gap-1">
                {NAV.map(({ href, label, icon: Icon }) => {
                  const isActive = active === href || (!active && href === '/');
                  return (
                    <Link key={href} href={href}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'
                      }`}>
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/admin/usuarios"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                <Users className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Usuários</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
