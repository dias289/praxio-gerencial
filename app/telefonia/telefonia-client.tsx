'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Phone, PhoneOff, PhoneMissed, Clock, Timer, PercentCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer,
} from 'recharts';

interface Kpis {
  total: number; atendidas: number; abandonadas: number;
  pctAband: number; esperaMedSeg: number; tmaSeg: number;
}
interface Data {
  kpis: Kpis;
  serieMensal: { mes: string; atendidas: number; abandonadas: number }[];
  anoAano: Record<string, number | string>[];
  anos: string[];
  anoResumo: { ano: number; total: number; ytd: number; cresc: number | null }[];
  mesAtual: number;
  porFila: { fila: string; atendidas: number; abandonadas: number }[];
  porAgente: { agente: string; atendidas: number; tmaSeg: number }[];
  ultimaChamada: string | null;
}

const anoAtual = new Date().getFullYear();
const PERIODOS = [
  { value: 'mes', label: 'Este mês' },
  { value: 'trimestre', label: 'Últimos 3 meses' },
  { value: 'ano', label: 'Este ano' },
  ...Array.from({ length: anoAtual - 2022 + 1 }, (_, i) => { const a = anoAtual - i; return { value: String(a), label: String(a) }; }),
  { value: 'tudo', label: 'Todo o período' },
];
const CORES_ANO = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'];

function fmtSeg(s: number) {
  if (s >= 60) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}
function fmtMes(m: string) {
  const [a, mm] = m.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[parseInt(mm) - 1]}/${a.slice(2)}`;
}

const MES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function CrescResumo({ resumo, mesAtual }: { resumo: { ano: number; total: number; cresc: number | null }[]; mesAtual: number }) {
  if (!resumo?.length) return null;
  const janela = `Jan–${MES_ABREV[mesAtual] ?? ''}`;
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {resumo.map(r => (
          <span key={r.ano} className="inline-flex items-center gap-1.5 text-xs bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-full px-2.5 py-1">
            <b className="text-gray-700 dark:text-slate-200">{r.ano}</b>
            <span className="text-gray-500 dark:text-slate-400 tabular-nums">{r.total.toLocaleString('pt-BR')}</span>
            {r.cresc !== null && (
              <span className={`font-semibold ${r.cresc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {r.cresc >= 0 ? '▲' : '▼'} {Math.abs(r.cresc)}%
              </span>
            )}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">Crescimento comparável ({janela}, ano vs ano anterior)</p>
    </div>
  );
}
function Kpi({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${color.replace('text-', 'bg-').replace('-600', '-50').replace('-500', '-50')}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

export default function TelefoniaClient() {
  const [periodo, setPeriodo] = useState('ano');
  const [fila, setFila] = useState('sigai');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/telefonia?periodo=${periodo}&fila=${fila}`);
      setData(await r.json());
    } finally { setLoading(false); }
  }, [periodo, fila]);

  useEffect(() => { load(); }, [load]);

  const k = data?.kpis ?? { total: 0, atendidas: 0, abandonadas: 0, pctAband: 0, esperaMedSeg: 0, tmaSeg: 0 };
  const serie = (data?.serieMensal ?? []).map(m => ({ ...m, mes: fmtMes(m.mes) }));

  return (
    <div className="space-y-6">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Telefonia — Fila de Atendimento</h1>
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-0.5">
            {k.total.toLocaleString('pt-BR')} chamadas
            {data?.ultimaChamada ? ` · última em ${new Date(data.ultimaChamada).toLocaleDateString('pt-BR')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={fila} onChange={e => setFila(e.target.value)}
            className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800">
            <option value="sigai">Filas Siga-i</option>
            <option value="todas">Todas as filas</option>
          </select>
          <select value={periodo} onChange={e => setPeriodo(e.target.value)}
            className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800">
            {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={load} className="flex items-center gap-1.5 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 hover:bg-gray-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi icon={Phone}        label="Total"          value={k.total.toLocaleString('pt-BR')} color="text-blue-600" />
        <Kpi icon={PhoneOff}     label="Atendidas"      value={k.atendidas.toLocaleString('pt-BR')} color="text-green-600" />
        <Kpi icon={PhoneMissed}  label="Abandonadas"    value={k.abandonadas.toLocaleString('pt-BR')} color="text-red-600" />
        <Kpi icon={PercentCircle} label="% Abandono"    value={`${k.pctAband}%`}
          color={k.pctAband <= 5 ? 'text-green-600' : k.pctAband <= 10 ? 'text-yellow-600' : 'text-red-600'} />
        <Kpi icon={Clock}        label="Espera média"   value={fmtSeg(k.esperaMedSeg)} color="text-amber-600" />
        <Kpi icon={Timer}        label="TMA (duração)"  value={fmtSeg(k.tmaSeg)} color="text-purple-600" />
      </div>

      {/* Volume por mês */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-4">Volume por mês</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} /><YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <Tooltip /><Legend />
            <Bar dataKey="atendidas" name="Atendidas" fill="#16a34a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="abandonadas" name="Abandonadas" fill="#dc2626" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Comparativo ano a ano */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-1">Comparativo ano a ano — Atendidas</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">Mesmo mês entre anos</p>
        <CrescResumo resumo={data?.anoResumo ?? []} mesAtual={data?.mesAtual ?? new Date().getMonth()} />
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data?.anoAano ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} /><YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <Tooltip /><Legend />
            {(data?.anos ?? []).map((a, i) => (
              <Line key={a} type="monotone" dataKey={a} stroke={CORES_ANO[i % CORES_ANO.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Por fila + Top agentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-4">Por fila</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.porFila ?? []} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="fila" tick={{ fontSize: 11, fill: '#94a3b8' }} width={140} />
              <Tooltip /><Legend />
              <Bar dataKey="atendidas" name="Atendidas" fill="#16a34a" stackId="a" />
              <Bar dataKey="abandonadas" name="Abandonadas" fill="#dc2626" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-4">Top agentes (atendidas)</h3>
          <div className="overflow-auto max-h-[260px]">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-slate-400 uppercase border-b">
                <tr><th className="text-left py-2">Agente</th><th className="text-right py-2">Atendidas</th><th className="text-right py-2">TMA</th></tr>
              </thead>
              <tbody>
                {(data?.porAgente ?? []).map(a => (
                  <tr key={a.agente} className="border-b border-gray-50 dark:border-slate-700">
                    <td className="py-2 text-gray-700 dark:text-slate-200">{a.agente}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{a.atendidas.toLocaleString('pt-BR')}</td>
                    <td className="py-2 text-right text-gray-500 dark:text-slate-400 tabular-nums">{fmtSeg(a.tmaSeg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
