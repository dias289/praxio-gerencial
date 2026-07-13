'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, TrendingUp, Users, CheckCircle, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from 'recharts';

// ── Tipos ────────────────────────────────────────────────────────────────────
interface ConsultorMetric {
  consultor: string; grupo: string; time: string;
  total: number; concluidos: number; emAberto: number;
  slaPercent: number | null; tmaMedio: number | null;
  mediaMensal: number; porMes: Record<string, number>;
}
interface TimeMetric { time: string; total: number; concluidos: number; emAberto: number; slaPercent: number | null }
interface Kpis { total: number; concluidos: number; emAberto: number; slaPercent: number; tmaMedio: number | null }
interface MesSerie { mes: string; abertos: number; concluidos: number }
interface DashData {
  kpis: Kpis;
  porTime: TimeMetric[];
  porConsultor: ConsultorMetric[];
  serieMensal: MesSerie[];
  anoAano: Record<string, number | string>[];
  anoResumo: { ano: number; total: number; ytd: number; cresc: number | null }[];
  mesAtual: number;
  consultores: string[];
  times: string[];
  ultimaColeta: { concluidoEm: string; totalTickets: number } | null;
}

const ANO_INICIO = 2023;
const anoAtual   = new Date().getFullYear();
const PERIODOS = [
  { value: 'mes',       label: 'Este mês' },
  { value: 'trimestre', label: 'Últimos 3 meses' },
  { value: 'ano',       label: 'Este ano' },
  ...Array.from({ length: anoAtual - ANO_INICIO + 1 }, (_, i) => {
    const ano = anoAtual - i;
    return { value: String(ano), label: String(ano) };
  }),
  { value: 'tudo',      label: 'Todo o período' },
];

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const CORES_TIME: Record<string, string> = {
  'Administrativo': '#2563eb',
  'Operacional':    '#16a34a',
  'Outros':         '#9ca3af',
};

const CORES_ANO = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'];
const MES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function CrescResumo({ resumo, mesAtual }: { resumo: { ano: number; total: number; cresc: number | null }[]; mesAtual: number }) {
  if (!resumo?.length) return null;
  const janela = `Jan\u2013${MES_ABREV[mesAtual] ?? ''}`;
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {resumo.map(r => (
          <span key={r.ano} className="inline-flex items-center gap-1.5 text-xs bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-full px-2.5 py-1">
            <b className="text-gray-700 dark:text-slate-200">{r.ano}</b>
            <span className="text-gray-500 dark:text-slate-400 tabular-nums">{r.total.toLocaleString('pt-BR')}</span>
            {r.cresc !== null && (
              <span className={`font-semibold ${r.cresc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {r.cresc >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(r.cresc)}%
              </span>
            )}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">Crescimento comparável ({janela}, ano vs ano anterior)</p>
    </div>
  );
}
function KpiCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${color.replace('text-','bg-').replace('-600','-50').replace('-500','-50')}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

function SlaBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400 dark:text-slate-500 text-xs">—</span>;
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
  const [data,     setData]     = useState<DashData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [periodo,  setPeriodo]  = useState('tudo');
  const [mes,      setMes]      = useState('0');  // 0 = todo o ano
  const [de,       setDe]       = useState('');
  const [ate,      setAte]      = useState('');
  const [timeFiltro, setTimeFiltro] = useState('todos');
  const [consultor, setConsultor]   = useState('todos');
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({ Administrativo: true, Operacional: true });

  const isAnoEspecifico = /^\d{4}$/.test(periodo);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ periodo, time: timeFiltro, consultor });
      if (isAnoEspecifico && mes !== '0') params.set('mes', mes);
      if (de && ate) { params.set('de', de); params.set('ate', ate); }
      const res    = await fetch(`/api/metrics?${params}`);
      const json   = await res.json();
      setData(json);
    } finally { setLoading(false); }
  }, [periodo, mes, timeFiltro, consultor, isAnoEspecifico, de, ate]);

  useEffect(() => { load(); }, [load]);

  const { kpis, porTime, porConsultor, serieMensal, anoAano, anoResumo, mesAtual, consultores, times, ultimaColeta } = data ?? {
    kpis: { total: 0, concluidos: 0, emAberto: 0, slaPercent: 0, tmaMedio: null },
    porTime: [], porConsultor: [], serieMensal: [], anoAano: [], anoResumo: [], mesAtual: new Date().getMonth(), consultores: [], times: [], ultimaColeta: null,
  };

  const formatMes = (mes: string) => {
    const [ano, m] = mes.split('-');
    return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${ano.slice(2)}`;
  };

  // Agrupa consultores por time
  const consultoresPorTime = porConsultor.reduce<Record<string, ConsultorMetric[]>>((acc, c) => {
    (acc[c.time] ??= []).push(c);
    return acc;
  }, {});

  const toggleTime = (time: string) =>
    setExpandidos(prev => ({ ...prev, [time]: !prev[time] }));

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho com filtros ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Visão Geral de Desempenho</h1>
          {ultimaColeta && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              {ultimaColeta.totalTickets?.toLocaleString('pt-BR')} tickets · atualizado em{' '}
              {new Date(ultimaColeta.concluidoEm).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
            value={periodo} disabled={!!(de && ate)} onChange={e => { setPeriodo(e.target.value); setMes('0'); }}>
            {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {isAnoEspecifico && (
            <select className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={mes} onChange={e => setMes(e.target.value)}>
              <option value="0">Todo o ano</option>
              {MESES.map((m, i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1 text-sm">
            <input type="date" value={de} max={ate || undefined} onChange={e => setDe(e.target.value)} title="Data inicial"
              className="border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400 dark:text-slate-500">até</span>
            <input type="date" value={ate} min={de || undefined} onChange={e => setAte(e.target.value)} title="Data final"
              className="border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {(de || ate) && (
              <button onClick={() => { setDe(''); setAte(''); }} title="Limpar intervalo"
                className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 px-1 text-base leading-none">×</button>
            )}
          </div>
          <select className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={timeFiltro} onChange={e => setTimeFiltro(e.target.value)}>
            <option value="todos">Todos os times</option>
            {times.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={consultor} onChange={e => setConsultor(e.target.value)}>
            <option value="todos">Todos os consultores</option>
            {consultores.map(c => <option key={c} value={c}>{c.replace(/\s*\(N\d+\)$/, '')}</option>)}
          </select>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ── KPI Cards globais ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard icon={TrendingUp}    label="Total de Tickets"    value={kpis.total.toLocaleString('pt-BR')}    color="text-blue-600" />
        <KpiCard icon={CheckCircle}   label="Concluídos"          value={kpis.concluidos.toLocaleString('pt-BR')} color="text-green-600" />
        <KpiCard icon={AlertTriangle} label="Em Aberto"           value={kpis.emAberto.toLocaleString('pt-BR')}  color="text-yellow-600" />
        <KpiCard icon={Users}         label="SLA do Backlog"          value={`${kpis.slaPercent}%`}
          sub={kpis.slaPercent >= 90 ? '✓ Backlog na meta' : `✗ ${kpis.emAberto} em aberto acima da meta`}
          color={kpis.slaPercent >= 90 ? 'text-green-600' : kpis.slaPercent >= 70 ? 'text-yellow-600' : 'text-red-600'} />
        <KpiCard icon={Clock}         label="TMA do Backlog (h úteis)" value={kpis.tmaMedio !== null ? `${kpis.tmaMedio}h` : '—'} color="text-purple-600" />
      </div>

      {/* ── KPIs por Time ── */}
      {porTime.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {porTime.map(t => (
            <div key={t.time} className="bg-white dark:bg-slate-800 rounded-xl border-2 shadow-sm p-5"
              style={{ borderColor: CORES_TIME[t.time] ?? '#e5e7eb' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: CORES_TIME[t.time] ?? '#9ca3af' }} />
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm">Time {t.time}</h3>
                </div>
                <span className="text-xs text-gray-400 dark:text-slate-500">{t.total.toLocaleString('pt-BR')} tickets totais</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">{t.concluidos.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Concluídos</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{t.emAberto.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Em aberto</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${t.slaPercent !== null && t.slaPercent >= 90 ? 'text-green-600' : 'text-red-500'}`}>
                    {t.slaPercent !== null ? `${t.slaPercent}%` : '—'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">SLA backlog</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Concluídos por Mês ── */}
      {(() => {
        const chartData    = serieMensal.map(m => ({ ...m, mes: formatMes(m.mes) }));
        const total12      = chartData.reduce((s, m) => s + m.concluidos, 0);
        const media        = chartData.length > 0 ? Math.round(total12 / chartData.length) : 0;
        const mesAtual     = chartData[chartData.length - 1]?.concluidos ?? 0;
        const mesAnterior  = chartData[chartData.length - 2]?.concluidos ?? 0;
        const variacao     = mesAnterior > 0 ? Math.round(((mesAtual - mesAnterior) / mesAnterior) * 100) : 0;
        return (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Concluídos por Mês</h2>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Últimos 12 meses · linha tracejada = média ({media}/mês)</p>
              </div>
              <div className="flex items-center gap-6 text-right">
                <div><p className="text-2xl font-bold text-green-600">{mesAtual.toLocaleString('pt-BR')}</p><p className="text-xs text-gray-400 dark:text-slate-500">mês atual</p></div>
                <div><p className={`text-lg font-semibold ${variacao >= 0 ? 'text-green-600' : 'text-red-500'}`}>{variacao >= 0 ? '↑' : '↓'} {Math.abs(variacao)}%</p><p className="text-xs text-gray-400 dark:text-slate-500">vs anterior</p></div>
                <div><p className="text-lg font-semibold text-gray-700 dark:text-slate-200">{total12.toLocaleString('pt-BR')}</p><p className="text-xs text-gray-400 dark:text-slate-500">total 12m</p></div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ left: 0, right: 10, top: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={35} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={(v: unknown) => typeof v === 'number' ? [v.toLocaleString('pt-BR'), 'Concluídos'] : ['', '']} />
                <ReferenceLine y={media} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: `Média: ${media}`, position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                <Bar dataKey="concluidos" name="Concluídos" radius={[4,4,0,0]} maxBarSize={38}>
                  {chartData.map((entry, idx) => <Cell key={idx} fill={entry.concluidos >= media ? '#16a34a' : '#86efac'} />)}
                  <LabelList dataKey="concluidos" position="top" style={{ fontSize: 10, fill: '#6b7280', fontWeight: 600 }} formatter={(v: unknown) => typeof v === 'number' && v > 0 ? v.toLocaleString('pt-BR') : ''} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* ── Comparativo ano a ano (Concluídos) ── */}
      {anoResumo.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1">Comparativo ano a ano — Concluídos</h2>
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">Mesmo mês entre anos</p>
          <CrescResumo resumo={anoResumo} mesAtual={mesAtual} />
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={anoAano}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip /><Legend />
              {anoResumo.map((r, i) => (
                <Line key={r.ano} type="monotone" dataKey={String(r.ano)} stroke={CORES_ANO[i % CORES_ANO.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Ranking por Time e Consultor ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Ranking por Time e Consultor</h2>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Clique no consultor para ver detalhes · Clique no time para expandir/recolher</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-700">
                <th className="text-left px-6 py-3 font-medium text-gray-500 dark:text-slate-400 text-xs uppercase">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-slate-400 text-xs uppercase">Consultor</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-slate-400 text-xs uppercase">Total</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-slate-400 text-xs uppercase">Concluídos</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-slate-400 text-xs uppercase hidden lg:table-cell">Média/mês</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-slate-400 text-xs uppercase hidden lg:table-cell">Em Aberto</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-slate-400 text-xs uppercase" style={{ minWidth: 120 }}>SLA backlog (24h)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-slate-400 text-xs uppercase hidden xl:table-cell">TMA</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(consultoresPorTime).map(([time, consultoresDoTime]) => {
                const isOpen = expandidos[time] !== false;
                const totalTime = consultoresDoTime.reduce((s, c) => s + c.total, 0);
                const concTime  = consultoresDoTime.reduce((s, c) => s + c.concluidos, 0);
                const cor       = CORES_TIME[time] ?? '#9ca3af';
                // Rank global acumulado
                let rankOffset  = Object.entries(consultoresPorTime)
                  .slice(0, Object.keys(consultoresPorTime).indexOf(time))
                  .reduce((s, [, cs]) => s + cs.length, 0);

                return [
                  // ── Linha de cabeçalho do time ──
                  <tr key={`time-${time}`}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleTime(time)}>
                    <td colSpan={8} className="px-6 py-3 border-t-2" style={{ borderColor: cor }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                            : <ChevronUp className="h-4 w-4 text-gray-400 dark:text-slate-500" />}
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: cor }} />
                          <span className="font-bold text-gray-900 dark:text-slate-100 text-sm">Time {time}</span>
                          <span className="text-xs text-gray-400 dark:text-slate-500">· {consultoresDoTime.length} consultores</span>
                        </div>
                        <div className="flex items-center gap-6 text-right text-sm">
                          <span className="text-gray-500 dark:text-slate-400">{totalTime.toLocaleString('pt-BR')} tickets</span>
                          <span className="font-bold" style={{ color: cor }}>{concTime.toLocaleString('pt-BR')} concluídos</span>
                        </div>
                      </div>
                    </td>
                  </tr>,
                  // ── Linhas dos consultores (se expandido) ──
                  ...(isOpen ? consultoresDoTime.map((c, idx) => (
                    <tr key={c.consultor} className="hover:bg-gray-50 transition-colors border-b border-gray-50 dark:border-slate-700">
                      <td className="px-6 py-3.5 pl-12 text-gray-400 dark:text-slate-500 text-xs font-medium">{rankOffset + idx + 1}</td>
                      <td className="px-4 py-3.5">
                        <Link href={`/consultor/${encodeURIComponent(c.consultor)}`}
                          className="font-medium text-blue-600 hover:underline">
                          {c.consultor.replace(/\s*\(N\d+\)$/, '')}
                        </Link>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{c.grupo}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right text-gray-600 dark:text-slate-300 tabular-nums">{c.total.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-lg font-bold text-gray-900 dark:text-slate-100">{c.concluidos.toLocaleString('pt-BR')}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right hidden lg:table-cell text-gray-600 dark:text-slate-300 tabular-nums">{c.mediaMensal}/mês</td>
                      <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                        <span className={`text-sm font-medium ${c.emAberto > 10 ? 'text-red-600' : 'text-gray-600 dark:text-slate-300'}`}>{c.emAberto}</span>
                      </td>
                      <td className="px-4 py-3.5"><SlaBar value={c.slaPercent} /></td>
                      <td className="px-4 py-3.5 text-right hidden xl:table-cell text-gray-500 dark:text-slate-400 text-xs tabular-nums">
                        {c.tmaMedio !== null ? `${c.tmaMedio}h` : '—'}
                      </td>
                    </tr>
                  )) : []),
                ];
              })}
              {porConsultor.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400 dark:text-slate-500 text-sm">
                  Nenhum dado para o período selecionado.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Evolução por consultor (top 5 por time) ── */}
      {porConsultor.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">Evolução de Concluídos — Top 5 Consultores</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="mes" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 10 }} tickLine={false} tickFormatter={formatMes} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} labelFormatter={v => formatMes(v as string)} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => (v as string).replace(/\s*\(N\d+\)$/, '')} />
              {porConsultor.slice(0, 5).map((c, idx) => {
                const serieData = Object.entries(c.porMes).sort().map(([mes, v]) => ({ mes, value: v }));
                const cores = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed'];
                return (
                  <Line key={c.consultor} data={serieData} type="monotone" dataKey="value"
                    name={c.consultor} stroke={cores[idx % cores.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
