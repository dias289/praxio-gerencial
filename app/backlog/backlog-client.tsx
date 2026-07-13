'use client';
import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle, Users, Timer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';
import { KpiCard, fmtNum, fmtMes } from '@/components/analise-shell';

interface Data {
  kpis: { total: number; agingMedio: number; semSla: number; emRisco: number };
  faixas: Record<string, number>;
  porGrupo: { grupo: string; total: number; semSla: number; emRisco: number; agingMedio: number }[];
  porConsultor: { consultor: string; grupo: string; total: number; semSla: number; emRisco: number; agingMedio: number }[];
  evolucao: { mes: string; abertos: number; concluidos: number }[];
}

export default function BacklogClient() {
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [time,    setTime]    = useState('todos');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/analises/backlog?time=${time}`);
    setData(await r.json());
    setLoading(false);
  }, [time]);

  useEffect(() => { load(); }, [load]);

  const faixasData = data ? Object.entries(data.faixas).map(([faixa, count]) => ({ faixa, count })) : [];
  const evolucao   = (data?.evolucao ?? []).map(m => ({ ...m, mes: fmtMes(m.mes) }));
  const fmt = (v: unknown) => (typeof v === 'number' ? fmtNum(v) : String(v ?? '')) as any;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Backlog de Tickets</h1>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Tickets atualmente em aberto — aging e distribuição</p>
        </div>
        <select value={time} onChange={e => setTime(e.target.value)}
          className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="todos">Todos os times</option>
          <option value="Administrativo">Administrativo</option>
          <option value="Operacional">Operacional</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon={Clock}         label="Total em Aberto"     value={fmtNum(data?.kpis.total ?? 0)}   color="text-blue-600" />
        <KpiCard icon={Timer}         label="Aging Médio (dias)"  value={`${data?.kpis.agingMedio ?? 0}d`} color="text-orange-600" />
        <KpiCard icon={AlertTriangle} label="SLA em Risco (>24h úteis)" value={fmtNum(data?.kpis.emRisco ?? 0)} color="text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Backlog por Grupo de Atendimento</h2>
          {loading ? <div className="h-40 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.porGrupo ?? []} layout="vertical" margin={{ left: 8, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="grupo" tick={{ fontSize: 10 }} width={110} />
                <Tooltip formatter={fmt} />
                <Bar dataKey="total" name="Em Aberto" fill="#3b82f6" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Distribuição por Aging (dias em aberto)</h2>
          {loading ? <div className="h-40 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={faixasData} margin={{ top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="faixa" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip formatter={fmt} />
                <Bar dataKey="count" name="Tickets" radius={[4,4,0,0]}>
                  {faixasData.map((_, i) => {
                    const colors = ['#22c55e','#f59e0b','#f97316','#ef4444'];
                    return <Cell key={i} fill={colors[i] ?? '#3b82f6'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Evolução — Abertos vs Concluídos (últimos 12 meses)</h2>
        {loading ? <div className="h-48 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</div> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={evolucao} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip formatter={fmt} />
              <Legend />
              <Line type="monotone" dataKey="abertos"    name="Abertos"    stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="concluidos" name="Concluídos" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Backlog por Consultor</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-700">
                {['Consultor','Grupo','Em Aberto','Aging Médio','SLA em Risco'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</td></tr>
              ) : (data?.porConsultor ?? []).map((c, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-slate-700 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">{c.consultor}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">{c.grupo}</td>
                  <td className="px-4 py-3 font-bold text-blue-600">{c.total}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300">{c.agingMedio}d</td>
                  <td className="px-4 py-3 text-red-600 font-medium">{c.emRisco}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
