'use client';
import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, CheckCircle, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, LabelList, Legend,
} from 'recharts';
import { KpiCard, PeriodFilter, fmtNum, fmtMes } from '@/components/analise-shell';

interface Data {
  kpis: { totalAbertos: number; totalConcluidos: number; mediaAb: number; mediaConc: number; mesComMais: string; variacaoAb: number };
  serieMensal: { mes: string; abertos: number; concluidos: number }[];
  porModulo:   { modulo: string; abertos: number; concluidos: number }[];
  porGrupo:    { grupo: string; abertos: number; concluidos: number }[];
  topClientes: { cliente: string; abertos: number; concluidos: number }[];
}

export default function AberturaClient() {
  const [data,    setData]    = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('ano');
  const [mes,     setMes]     = useState('0');
  const [time,    setTime]    = useState('todos');
  const [aba,     setAba]     = useState<'abertura'|'conclusao'>('abertura');

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ periodo, time });
    if (/^\d{4}$/.test(periodo) && mes !== '0') p.set('mes', mes);
    const r = await fetch(`/api/analises/abertura?${p}`);
    setData(await r.json());
    setLoading(false);
  }, [periodo, mes, time]);

  useEffect(() => { load(); }, [load]);

  const serie = (data?.serieMensal ?? []).map(m => ({ ...m, mes: fmtMes(m.mes) }));
  const mediaKey = aba === 'abertura' ? 'mediaAb' : 'mediaConc';
  const media = data?.kpis[mediaKey] ?? 0;
  const dataKey = aba === 'abertura' ? 'abertos' : 'concluidos';

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Tickets — Abertura & Conclusão</h1>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Volume por período, módulo, grupo e cliente</p>
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

      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700">
        {(['abertura','conclusao'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              aba === a ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800'
            }`}>
            {a === 'abertura' ? '📥 Abertura' : '✅ Conclusão'}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {aba === 'abertura' ? <>
          <KpiCard icon={TrendingUp}   label="Total Abertos"        value={fmtNum(data?.kpis.totalAbertos ?? 0)}  color="text-blue-600" />
          <KpiCard icon={BarChart3}    label="Média Mensal"          value={data?.kpis.mediaAb ?? 0}              color="text-indigo-600" />
          <KpiCard icon={TrendingUp}   label="Variação (mês atual)"  value={`${data?.kpis.variacaoAb ?? 0 > 0 ? '+' : ''}${data?.kpis.variacaoAb ?? 0}%`}
            color={(data?.kpis.variacaoAb ?? 0) >= 0 ? 'text-red-600' : 'text-green-600'} />
          <KpiCard icon={BarChart3}    label="Mês com Mais Abertura" value={data?.kpis.mesComMais ?? '—'}         color="text-orange-600" />
        </> : <>
          <KpiCard icon={CheckCircle}  label="Total Concluídos"    value={fmtNum(data?.kpis.totalConcluidos ?? 0)} color="text-green-600" />
          <KpiCard icon={BarChart3}    label="Média Mensal"         value={data?.kpis.mediaConc ?? 0}              color="text-indigo-600" />
          <KpiCard icon={TrendingDown} label="Variação (mês atual)" value={`${(data?.kpis.variacaoAb ?? 0) >= 0 ? '+' : ''}${data?.kpis.variacaoAb ?? 0}%`}
            color={(data?.kpis.variacaoAb ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'} />
          <KpiCard icon={BarChart3}    label="Melhor Mês"           value={data?.kpis.mesComMais ?? '—'}           color="text-orange-600" />
        </>}
      </div>

      {/* Série mensal */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
              {aba === 'abertura' ? 'Tickets Abertos por Mês' : 'Tickets Concluídos por Mês'}
            </h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Linha tracejada = média ({media}/mês)</p>
          </div>
        </div>
        {loading ? <div className="h-56 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</div> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={serie} margin={{ left: 0, right: 10, top: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={35} />
              <Tooltip formatter={(v: unknown) => typeof v === 'number' ? [fmtNum(v), aba === 'abertura' ? 'Abertos' : 'Concluídos'] : ['','']} />
              <ReferenceLine y={media} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1.5}
                label={{ value: `Média: ${media}`, position: 'right', fontSize: 10, fill: '#f59e0b' }} />
              <Bar dataKey={dataKey} name={aba === 'abertura' ? 'Abertos' : 'Concluídos'}
                fill={aba === 'abertura' ? '#3b82f6' : '#22c55e'} radius={[4,4,0,0]} maxBarSize={38}>
                <LabelList dataKey={dataKey} position="top" style={{ fontSize: 10, fill: '#6b7280', fontWeight: 600 }}
                  formatter={(v: unknown) => typeof v === 'number' && v > 0 ? fmtNum(v) : ''} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por módulo */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Top 15 Módulos</h2>
          {loading ? <div className="h-64 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</div> : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={data?.porModulo ?? []} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="modulo" tick={{ fontSize: 9 }} width={140} />
                <Tooltip formatter={(v: unknown) => typeof v === 'number' ? fmtNum(v) : String(v ?? '')} />
                <Bar dataKey={dataKey} name={aba === 'abertura' ? 'Abertos' : 'Concluídos'}
                  fill={aba === 'abertura' ? '#3b82f6' : '#22c55e'} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top 10 clientes */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Top 10 Clientes</h2>
          {loading ? <div className="h-64 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</div> : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={data?.topClientes ?? []} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="cliente" tick={{ fontSize: 9 }} width={140} />
                <Tooltip formatter={(v: unknown) => typeof v === 'number' ? fmtNum(v) : String(v ?? '')} />
                <Bar dataKey={dataKey} name={aba === 'abertura' ? 'Abertos' : 'Concluídos'}
                  fill={aba === 'abertura' ? '#6366f1' : '#10b981'} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Por grupo */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Por Grupo de Atendimento</h2>
        {loading ? <div className="h-40 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">Carregando...</div> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.porGrupo ?? []} margin={{ top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="grupo" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip formatter={(v: unknown) => typeof v === 'number' ? fmtNum(v) : String(v ?? '')} />
              <Legend />
              <Bar dataKey="abertos"    name="Abertos"    fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={40} />
              <Bar dataKey="concluidos" name="Concluídos" fill="#22c55e" radius={[4,4,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
