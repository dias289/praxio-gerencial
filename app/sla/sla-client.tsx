'use client';
import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ShieldX, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';
import { KpiCard, SlaBar, PeriodFilter, fmtNum, fmtMes } from '@/components/analise-shell';

interface Data {
  kpis: { total: number; dentro: number; fora: number; slaPercent: number; tmaMedio: number | null };
  distTma: Record<string, number>;
  porGrupo: { grupo: string; dentro: number; fora: number; slaPercent: number; tmaMedio: number | null }[];
  porModulo: { modulo: string; dentro: number; fora: number; slaPercent: number }[];
  porConsultor: { consultor: string; grupo: string; dentro: number; fora: number; slaPercent: number; tmaMedio: number | null }[];
  evolucao: { mes: string; slaPercent: number; tma: number | null }[];
}

export default function SlaClient() {
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('ano');
  const [mes,     setMes]     = useState('0');
  const [time,    setTime]    = useState('todos');
  const [sortCol, setSortCol] = useState<'slaPercent'|'tmaMedio'|'total'>('total');

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ periodo, time });
    if (/^\d{4}$/.test(periodo) && mes !== '0') p.set('mes', mes);
    const r = await fetch(`/api/analises/sla?${p}`);
    setData(await r.json());
    setLoading(false);
  }, [periodo, mes, time]);

  useEffect(() => { load(); }, [load]);

  const distData = data ? Object.entries(data.distTma).map(([faixa, count]) => ({ faixa, count })) : [];
  const evolucao = (data?.evolucao ?? []).map(m => ({ ...m, mes: fmtMes(m.mes) }));
  const sorted   = [...(data?.porConsultor ?? [])].sort((a, b) => {
    if (sortCol === 'slaPercent') return (b.slaPercent ?? 0) - (a.slaPercent ?? 0);
    if (sortCol === 'tmaMedio')   return (a.tmaMedio ?? 999) - (b.tmaMedio ?? 999);
    return b.dentro + b.fora - (a.dentro + a.fora);
  });
  const fmt = (v: unknown) => (typeof v === 'number' ? fmtNum(v) : String(v ?? '')) as any;
  const fmtPct = (v: unknown) => (typeof v === 'number' ? `${v}%` : String(v ?? '')) as any;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">SLA — Nível de Serviço</h1>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Meta: 24 horas úteis · seg–sex 08h–18h</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodFilter periodo={periodo} setPeriodo={setPeriodo} mes={mes} setMes={setMes} />
          <select value={time} onChange={e => setTime(e.target.value)}
            className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="todos">Todos os times</option>
            <option value="Administrativo">Administrativo</option>
            <option value="Operacional">Operacional</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={ShieldCheck} label="% Dentro do SLA"    value={`${data?.kpis.slaPercent ?? 0}%`}
          sub={(data?.kpis.slaPercent ?? 0) >= 90 ? '✓ Meta atingida' : '✗ Abaixo da meta'}
          color={(data?.kpis.slaPercent ?? 0) >= 90 ? 'text-green-600' : (data?.kpis.slaPercent ?? 0) >= 70 ? 'text-yellow-600' : 'text-red-600'} />
        <KpiCard icon={Clock}       label="TMA Médio (h úteis)" value={data?.kpis.tmaMedio != null ? `${data.kpis.tmaMedio}h` : '—'} color="text-purple-600" />
        <KpiCard icon={ShieldCheck} label="Dentro do SLA"       value={fmtNum(data?.kpis.dentro ?? 0)} color="text-green-600" />
        <KpiCard icon={ShieldX}     label="Fora do SLA"         value={fmtNum(data?.kpis.fora ?? 0)}   color="text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">SLA por Grupo de Atendimento</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.porGrupo ?? []} layout="vertical" margin={{ left: 8, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0,100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="grupo" tick={{ fontSize: 10 }} width={110} />
              <Tooltip formatter={fmtPct} />
              <Bar dataKey="slaPercent" name="% SLA" radius={[0,4,4,0]}>
                {(data?.porGrupo ?? []).map((g, i) => (
                  <Cell key={i} fill={g.slaPercent >= 90 ? '#22c55e' : g.slaPercent >= 70 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Distribuição do TMA (1º atendimento)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distData} margin={{ top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="faixa" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip formatter={fmt} />
              <Bar dataKey="count" name="Tickets" radius={[4,4,0,0]}>
                {distData.map((_, i) => {
                  const colors = ['#22c55e','#84cc16','#f59e0b','#ef4444'];
                  return <Cell key={i} fill={colors[i] ?? '#3b82f6'} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Evolução do SLA — últimos 12 meses</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={evolucao} margin={{ left: 0, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis yAxisId="pct" domain={[0,100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis yAxisId="h"   orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip />
            <Legend />
            <Line yAxisId="pct" type="monotone" dataKey="slaPercent" name="% SLA"         stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line yAxisId="h"   type="monotone" dataKey="tma"        name="TMA (h úteis)" stroke="#8b5cf6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">SLA por Módulo (top 15)</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data?.porModulo ?? []} layout="vertical" margin={{ left: 8, right: 60 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0,100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis type="category" dataKey="modulo" tick={{ fontSize: 9 }} width={140} />
            <Tooltip formatter={fmtPct} />
            <Bar dataKey="slaPercent" name="% SLA" radius={[0,4,4,0]}>
              {(data?.porModulo ?? []).map((m, i) => (
                <Cell key={i} fill={m.slaPercent >= 90 ? '#22c55e' : m.slaPercent >= 70 ? '#f59e0b' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">SLA por Consultor</h2>
          <select value={sortCol} onChange={e => setSortCol(e.target.value as any)}
            className="text-xs border border-gray-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800">
            <option value="total">Ordenar por volume</option>
            <option value="slaPercent">Ordenar por % SLA</option>
            <option value="tmaMedio">Ordenar por TMA</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-700">
                {['Consultor','Grupo','Dentro','Fora','% SLA','TMA Médio'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</td></tr>
              ) : sorted.map((c, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-slate-700 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">{c.consultor}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">{c.grupo}</td>
                  <td className="px-4 py-3 text-green-600 font-medium">{c.dentro}</td>
                  <td className="px-4 py-3 text-red-600">{c.fora}</td>
                  <td className="px-4 py-3" style={{ minWidth: 120 }}><SlaBar value={c.slaPercent} /></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300 tabular-nums">{c.tmaMedio != null ? `${c.tmaMedio}h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
