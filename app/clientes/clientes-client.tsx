'use client';
import { useState, useEffect, useCallback } from 'react';
import { Building, TrendingUp, AlertCircle, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { KpiCard, SlaBar, fmtNum } from '@/components/analise-shell';

interface Cliente {
  cliente: string; total: number; concluidos: number; emAberto: number;
  slaPercent: number | null; agingMedio: number | null; moduloPredominante: string;
}
interface Data {
  kpis: { total: number; comAbertos: number; mediaPorCliente: number; maiorCliente: string };
  top20volume: Cliente[]; top10abertos: Cliente[]; clientes: Cliente[];
}

export default function ClientesClient() {
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [time,    setTime]    = useState('todos');
  const [busca,   setBusca]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/analises/clientes?time=${time}`);
    setData(await r.json());
    setLoading(false);
  }, [time]);

  useEffect(() => { load(); }, [load]);

  const filtrados = (data?.clientes ?? []).filter(c =>
    c.cliente.toLowerCase().includes(busca.toLowerCase())
  );
  const fmt = (v: unknown) => (typeof v === 'number' ? fmtNum(v) : String(v ?? '')) as any;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Análise de Clientes</h1>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Volume, resolução e SLA por cliente</p>
        </div>
        <select value={time} onChange={e => setTime(e.target.value)}
          className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="todos">Todos os times</option>
          <option value="Administrativo">Administrativo</option>
          <option value="Operacional">Operacional</option>
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Building}    label="Clientes Ativos"       value={fmtNum(data?.kpis.total ?? 0)}          color="text-blue-600" />
        <KpiCard icon={TrendingUp}  label="Média de Tickets"      value={data?.kpis.mediaPorCliente ?? 0}         color="text-green-600" />
        <KpiCard icon={AlertCircle} label="Com Tickets em Aberto" value={fmtNum(data?.kpis.comAbertos ?? 0)}      color="text-yellow-600" />
        <KpiCard icon={Users}       label="Maior Volumetria"      value={data?.kpis.maiorCliente ?? '—'}          color="text-purple-600" sub="cliente com mais tickets" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Top 20 Clientes — Volume Total</h2>
          {loading ? <div className="h-64 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</div> : (
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={data?.top20volume ?? []} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="cliente" tick={{ fontSize: 9 }} width={140} />
                <Tooltip formatter={fmt} />
                <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Top 10 Clientes — Tickets em Aberto</h2>
          {loading ? <div className="h-64 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</div> : (
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={data?.top10abertos ?? []} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="cliente" tick={{ fontSize: 9 }} width={140} />
                <Tooltip formatter={fmt} />
                <Bar dataKey="emAberto" name="Em Aberto" radius={[0,4,4,0]}>
                  {(data?.top10abertos ?? []).map((c, i) => (
                    <Cell key={i} fill={c.emAberto > 5 ? '#ef4444' : c.emAberto > 2 ? '#f59e0b' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
            Todos os Clientes {!loading && <span className="text-gray-400 dark:text-slate-500 font-normal">({filtrados.length})</span>}
          </h2>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente..."
            className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-slate-700">
              <tr className="border-b border-gray-100 dark:border-slate-700">
                {['Cliente','Total','Concluídos','Em Aberto','% SLA','Aging Médio','Módulo Principal'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</td></tr>
              ) : filtrados.map((c, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-slate-700 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-slate-100 text-xs">{c.cliente}</td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-slate-300 tabular-nums">{fmtNum(c.total)}</td>
                  <td className="px-4 py-2.5 text-green-600 tabular-nums">{fmtNum(c.concluidos)}</td>
                  <td className="px-4 py-2.5 text-yellow-600 tabular-nums">{c.emAberto}</td>
                  <td className="px-4 py-2.5" style={{ minWidth: 100 }}><SlaBar value={c.slaPercent} /></td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 text-xs">{c.agingMedio != null ? `${c.agingMedio}d` : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 text-xs">{c.moduloPredominante}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
