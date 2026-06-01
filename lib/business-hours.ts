/**
 * Cálculo de horas úteis para SLA.
 * Horas úteis: segunda a sexta, 08h–18h (horário de Brasília).
 */

const HORA_INICIO = Number(process.env.HORA_INICIO_UTIL ?? 8);   // 08:00
const HORA_FIM    = Number(process.env.HORA_FIM_UTIL   ?? 18);   // 18:00
const HORAS_DIA   = HORA_FIM - HORA_INICIO;                      // 10 horas/dia

/** Converte timestamp UTC para horário de Brasília (UTC-3) */
function toBRT(date: Date): Date {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000);
}

/** Verifica se uma data (em BRT) é dia útil */
function isDiaUtil(d: Date): boolean {
  const dia = d.getDay(); // 0=Dom, 6=Sáb
  return dia >= 1 && dia <= 5;
}

/**
 * Calcula horas úteis entre duas datas.
 * Considera apenas seg–sex, 08h–18h BRT.
 */
export function calcHorasUteis(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0;

  const startBRT = toBRT(inicio);
  const endBRT   = toBRT(fim);

  let horas = 0;
  const cur = new Date(startBRT);

  // Ajusta para o início do próximo período útil se necessário
  while (cur < endBRT) {
    const hora = cur.getHours();

    if (!isDiaUtil(cur) || hora >= HORA_FIM) {
      // Avança para o próximo dia útil às HORA_INICIO
      cur.setDate(cur.getDate() + 1);
      cur.setHours(HORA_INICIO, 0, 0, 0);
      while (!isDiaUtil(cur)) cur.setDate(cur.getDate() + 1);
      continue;
    }

    if (hora < HORA_INICIO) {
      cur.setHours(HORA_INICIO, 0, 0, 0);
      continue;
    }

    // Está em horário útil — calcula quanto tempo até fim do dia ou fim do período
    const fimDia     = new Date(cur); fimDia.setHours(HORA_FIM, 0, 0, 0);
    const fimEfetivo = endBRT < fimDia ? endBRT : fimDia;
    horas += (fimEfetivo.getTime() - cur.getTime()) / 3_600_000;
    cur.setTime(fimEfetivo.getTime());
  }

  return Math.round(horas * 100) / 100;
}

export type SlaStatus = 'dentro' | 'fora' | 'pendente';

/** Determina status do SLA baseado nas horas úteis */
export function getSlaStatus(horasUteis: number | null, metaHoras = 24): SlaStatus {
  if (horasUteis === null) return 'pendente';
  return horasUteis <= metaHoras ? 'dentro' : 'fora';
}

/** Retorna % de tickets dentro do SLA */
export function calcSlaPercent(tickets: { slaStatus: string }[]): number {
  const total = tickets.filter(t => t.slaStatus !== 'pendente').length;
  if (total === 0) return 0;
  const dentro = tickets.filter(t => t.slaStatus === 'dentro').length;
  return Math.round((dentro / total) * 100);
}
