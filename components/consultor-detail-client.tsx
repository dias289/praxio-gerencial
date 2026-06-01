'use client';

import { useState } from 'react';
import { ArrowLeft, CheckCircle, Clock, AlertCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Ticket {
  protocolo: string;
  assunto: string;
  status: string;
  grupo: string;
  cliente: string;
  abertura: Date;
  conclusao: Date | null;
  slaStatus: string;
  slaHorasUteis: number | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; color: string }> = {
    'Concluído':        { icon: CheckCircle,  color: 'text-green-600 bg-green-50'  },
    'Em andamento':     { icon: Clock,        color: 'text-blue-600 bg-blue-50'    },
    'Pendente cliente': { icon: AlertCircle,  color: 'text-yellow-600 bg-yellow-50'},
    'Cancelado':        { icon: XCircle,      color: 'text-gray-500 bg-gray-50'    },
  };
  const cfg  = map[status] ?? { icon: Clock, color: 'text-gray-500 bg-gray-50' };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function SlaBadge({ status, horas }: { status: string; horas: number | null }) {
  const color = status === 'dentro' ? 'text-green-700 bg-green-50'
              : status === 'fora'   ? 'text-red-700 bg-red-50'
              :                       'text-gray-500 bg-gray-50';
  const label = status === 'dentro' ? `✓ ${horas}h` : status === 'fora' ? `✗ ${horas}h` : '—';
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>;
}

export function ConsultorDetailClient({ nome, tickets }: { nome: string; tickets: Ticket[] }) {
  const [filtroStatus, setFiltroStatus] = useState('todos');

  const concluidos = tickets.filter(t => t.status === 'Concluído');
  const slaDentro  = tickets.filter(t => t.slaStatus === 'dentro').length;
  const slaTotal   = tickets.filter(t => t.slaStatus !== 'pendente').length;
  const slaPerc    = slaTotal > 0 ? Math.round((slaDentro / slaTotal) * 100) : 0;
  const tmaMedio   = (() => {
    const v = tickets.filter(t => t.slaHorasUteis !== null);
    if (!v.length) return null;
    return Math.round(v.reduce((s, t) => s + t.slaHorasUteis!, 0) / v.length * 10) / 10;
  })();

  // Série mensal
  const porMes: Record<string, number> = {};
  concluidos.forEach(t => {
    if (t.conclusao) {
      const d = new Date(t.conclusao);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
      porMes[k] = (porMes[k] ?? 0) + 1;
    }
  });
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const chartData = Object.entries(porMes).sort().slice(-12).map(([k, v]) => {
    const [ano, m] = k.split('-');
    return { mes: `${MESES[parseInt(m)-1]}/${ano.slice(2)}`, concluidos: v };
  });

  const filtrados = filtroStatus === 'todos' ? tickets
    : tickets.filter(t => t.status === filtroStatus);

  const statusOptions = ['todos', ...new Set(tickets.map(t => t.status))];

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Voltar ao dashboard
      </Link>

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{nome.replace(/\s*\(N\d+\)$/, '')}</h1>
            <p className="text-sm text-gray-500 mt-1">{tickets[0]?.grupo ?? '—'}</p>
          </div>
          <div className="grid grid-cols-4 gap-6 text-center">
            {[
              { label: 'Total',      value: tickets.length,   color: 'text-blue-600'   },
              { label: 'Concluídos', value: concluidos.length, color: 'text-green-600' },
              { label: 'SLA',        value: `${slaPerc}%`,    color: slaPerc >= 90 ? 'text-green-600' : 'text-red-600' },
              { label: 'TMA',        value: tmaMedio ? `${tmaMedio}h` : '—', color: 'text-purple-600' },
            ].map(k => (
              <div key={k.label}>
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico mensal */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Concluídos por Mês</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="concluidos" name="Concluídos" fill="#2563eb" radius={[4,4,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela de tickets */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Tickets ({filtrados.length})</h2>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            {statusOptions.map(s => (
              <option key={s} value={s}>{s === 'todos' ? 'Todos os status' : s}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500 text-xs uppercase">Protocolo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Assunto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase hidden md:table-cell">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase">SLA</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase hidden lg:table-cell">Abertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map(t => (
                <tr key={t.protocolo} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-mono text-xs text-blue-600">{t.protocolo}</td>
                  <td className="px-4 py-3 max-w-[280px] truncate text-gray-900" title={t.assunto}>{t.assunto || '—'}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs truncate max-w-[180px]">{t.cliente}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3 text-right"><SlaBadge status={t.slaStatus} horas={t.slaHorasUteis} /></td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-xs text-gray-400 tabular-nums">
                    {new Date(t.abertura).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
