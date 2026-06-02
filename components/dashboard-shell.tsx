import Link from 'next/link';
import { BarChart3, Building2, Users } from 'lucide-react';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Dashboard Gerencial</p>
                <p className="text-xs text-gray-500">Suporte Praxio</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/admin/usuarios"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors">
                <Users className="h-3.5 w-3.5" />
                <span>Usuários</span>
              </Link>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Building2 className="h-3.5 w-3.5" />
                <span>Siga-i · Siga One · Siga Emissor</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
