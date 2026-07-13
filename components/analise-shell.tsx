'use client';

import { useState } from 'react';

// ── KpiCard reutilizável ──────────────────────────────────────────────────────
export function KpiCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-gray-50 dark:bg-slate-700`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

// ── SlaBar reutilizável ───────────────────────────────────────────────────────
export function SlaBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400 dark:text-slate-500 text-xs">—</span>;
  const color = value >= 90 ? 'bg-green-500' : value >= 70 ? 'bg-yellow-500' : 'bg-red-500';
  const text  = value >= 90 ? 'text-green-700' : value >= 70 ? 'text-yellow-700' : 'text-red-700';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold w-8 ${text}`}>{value}%</span>
    </div>
  );
}

// ── PeriodFilter reutilizável ─────────────────────────────────────────────────
const ANO_INICIO = 2023;
const anoAtual   = new Date().getFullYear();

export const PERIODOS = [
  { value: 'mes',       label: 'Este mês' },
  { value: 'trimestre', label: 'Últimos 3 meses' },
  { value: 'ano',       label: 'Este ano' },
  ...Array.from({ length: anoAtual - ANO_INICIO + 1 }, (_, i) => ({
    value: String(anoAtual - i), label: String(anoAtual - i),
  })),
  { value: 'tudo', label: 'Todo o período' },
];

export const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

export function PeriodFilter({
  periodo, setPeriodo, mes, setMes,
}: {
  periodo: string; setPeriodo: (v: string) => void;
  mes: string;     setMes:     (v: string) => void;
}) {
  const isAno = /^\d{4}$/.test(periodo);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={periodo}
        onChange={e => { setPeriodo(e.target.value); setMes('0'); }}
        className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {isAno && (
        <select
          value={mes}
          onChange={e => setMes(e.target.value)}
          className="text-sm border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="0">Todo o ano</option>
          {MESES.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
        </select>
      )}
    </div>
  );
}

// ── PageHeader padrão para páginas de análise ─────────────────────────────────
export function PageHeader({
  title, subtitle, children,
}: {
  title: string; subtitle?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Tooltip formatador pt-BR ──────────────────────────────────────────────────
export function fmtNum(n: number) {
  return n.toLocaleString('pt-BR');
}

export function fmtMes(mes: string) {
  const [ano, m] = mes.split('-');
  return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${ano.slice(2)}`;
}
