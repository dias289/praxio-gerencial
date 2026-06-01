'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, TrendingUp, Users, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer,
} from 'recharts';

// ── Tipos ────────────────────────────────────────────────────────────────────
interface ConsultorMetric {
  consultor: string;
  grupo: string;
  total: number;
  concluidos: number;
  emAberto: number;
  slaPercent: number | null;
  tmaMedio: number | null;
  mediaMensal: number;
  porMes: Record<string, number>;
}
interface Kpis { total: number; concluidos: number; emAberto: number; slaPercent: number; tmaMedio: number | null }
interface MesSerie { mes: string; abertos: number; concluidos: number }
interface DashData {
  kpis: Kpis;
  porConsultor: ConsultorMetric[];
  serieMensal: MesSerie[];
  grupos: string[];
  consultores: string[];
  ultimaColeta: { concluidoEm: string; totalTickets: number } | null;
}

const CORES = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#be185d','#65a30d'];
const PERIODOS = [
  { value: 'mes', label: 'Este mês' },
  { value: 'trimestre', label: 'Últimos 3 meses' },
  { value: 'ano', label: 'Este ano' },
  { value: 'tudo', label: 'Todo o período' },
];

function KpiCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${color.replace('text-', 'bg-').replace('-600', '-50').replace('-500', '-50')}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

function SlaBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400 text-xs">—</span>;
  const color = value >= 90 ? 'bg-green-500' : value >= 70 ? 'bg-yellow-500' : 'bg-red-500';
  const text  = value >= 90 ? 'text-green-700' : value >= 70 ? 'text-yellow-700' : 'text-red-700';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-semibold w-8 ${text}`}>{value}%</span>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function DashboardClient() {
  const [data, setData]       = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('ano');
  const [grupo, setGrupo]     = useState('todos');
  const [consultor, setConsultor] = useState('todos');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ periodo, grupo, consultor });
      const res    = await fetch(`/api/metrics?${params}`);
      const json   = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [periodo, grupo, consultor]);

  useEffect(() => { load(); }, [load]);

  const { kpis, porConsultor, serieMensal, grupos, consultores, ultimaColeta } = data ?? {
    kpis: { total: 0, concluidos: 0, emAberto: 0, slaPercent: 0, tmaMedio: null },
    porConsultor: [], serieMensal: [], grupos: [], consultores: [], ultimaColeta: null,
  };

  // Formata rótulo do mês
  const formatMes = (mes: string) => {
    const [ano, m] = mes.split('-');
    return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m) - 1]}/${ano.slice(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho com filtros ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Visão Geral de Desempenho</h1>
          {ultimaColeta && (
            <p className="text-xs text-gray-500 mt-0.5">
              {ultimaColeta.totalTickets.toLocaleString('pt-BR')} tickets · atualizado em{' '}
              {new Date(ultimaColeta.concluidoEm).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Período */}
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={periodo} onChange={e => setPeriodo(e.target.value)}>
            {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {/* Grupo */}
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={grupo} onChange={e => setGrupo(e.target.value)}>
            <option value="todos">Todos os grupos</option>
            {grupos.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          {/* Consultor */}
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={consultor} onChange={e => setConsultor(e.target.value)}>
            <option value="todos">Todos os consultores</option>
            {consultores.map(c => <option key={c} value={c}>{c.replace(/\s*\(N\d+\)$/, '')}</option>)}
          </select>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard icon={TrendingUp}    label="Total de Tickets"    value={kpis.total.toLocaleString('pt-BR')}    color="text-blue-600" />
        <KpiCard icon={CheckCircle}   label="Concluídos"          value={kpis.concluidos.toLocaleString('pt-BR')} color="text-green-600" />
        <KpiCard icon={AlertTriangle} label="Em Aberto"           value={kpis.emAberto.toLocaleString('pt-BR')}  color="text-yellow-600" />
        <KpiCard icon={Users}         label="SLA Global"          value={`${kpis.slaPercent}%`}
          sub={`${kpis.slaPercent >= 90 ? '✓ Meta atingida' : '✗ Abaixo da meta'}`}
          color={kpis.slaPercent >= 90 ? 'text-green-600' : kpis.slaPercent >= 70 ? 'text-yellow-600' : 'text-red-600'} />
        <KpiCard icon={Clock}         label="TMA Médio (h úteis)" value={kpis.tmaMedio !== null ? `${kpis.tmaMedio}h` : '—'} color="text-purple-600" />
      </div>

      {/* ── Gráfico mensal ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Tickets por Mês — Últimos 12 meses</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={serieMensal.map(m => ({ ...m, mes: formatMes(m.mes) }))} margin={{ left: 0, right: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="abertos"    name="Abertos"    fill="#93c5fd" radius={[3,3,0,0]} maxBarSize={30} />
            <Bar dataKey="concluidos" name="Concluídos" fill="#2563eb" radius={[3,3,0,0]} maxBarSize={30} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Ranking de consultores ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Ranking de Consultores</h2>
          <p className="text-xs text-gray-400 mt-0.5">Ordenado por tickets concluídos no período</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium text-gray-500 text-xs uppercase">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Consultor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase hidden md:table-cell">Grupo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase">Concluídos</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase hidden lg:table-cell">Média/mês</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase hidden lg:table-cell">Em Aberto</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase" style={{ minWidth: 120 }}>SLA (24h úteis)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase hidden xl:table-cell">TMA Médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {porConsultor.slice(0, 20).map((c, idx) => (
                <tr key={c.consultor} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5 text-gray-400 text-xs font-medium">{idx + 1}</td>
                  <td className="px-4 py-3.5">
                    <Link href={`/consultor/${encodeURIComponent(c.consultor)}`}
                      className="font-medium text-blue-600 hover:underline">
                      {c.consultor.replace(/\s*\(N\d+\)$/, '')}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{c.grupo}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-lg font-bold text-gray-900">{c.concluidos.toLocaleString('pt-BR')}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden lg:table-cell text-gray-600 tabular-nums">{c.mediaMensal}/mês</td>
                  <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                    <span className={`text-sm font-medium ${c.emAberto > 10 ? 'text-red-600' : 'text-gray-600'}`}>{c.emAberto}</span>
                  </td>
                  <td className="px-4 py-3.5"><SlaBar value={c.slaPercent} /></td>
                  <td className="px-4 py-3.5 text-right hidden xl:table-cell text-gray-500 text-xs tabular-nums">
                    {c.tmaMedio !== null ? `${c.tmaMedio}h` : '—'}
                  </td>
                </tr>
              ))}
              {porConsultor.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400 text-sm">
                  Nenhum dado encontrado para o período selecionado.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Evolução por consultor (top 5) ── */}
      {porConsultor.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Evolução de Concluídos por Consultor — Top 5</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 10 }}
                tickLine={false} tickFormatter={formatMes} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                labelFormatter={v => formatMes(v as string)} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => (v as string).replace(/\s*\(N\d+\)$/, '')} />
              {porConsultor.slice(0, 5).map((c, idx) => {
                const serieData = Object.entries(c.porMes).sort().map(([mes, v]) => ({ mes, value: v }));
                return (
                  <Line key={c.consultor} data={serieData} type="monotone" dataKey="value"
                    name={c.consultor} stroke={CORES[idx % CORES.length]} strokeWidth={2}
                    dot={false} activeDot={{ r: 4 }} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
