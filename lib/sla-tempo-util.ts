/**
 * SLA "tempo útil sob o time" (definição oficial).
 *
 * Soma dos períodos em que o ticket esteve, ao mesmo tempo:
 *   1. dentro do horário comercial (seg–sex, 08h–18h BRT);
 *   2. com status "Em andamento";
 *   3. sob responsabilidade de um membro do TIME do ticket (Grupo de Atendimento).
 *
 * O relógio para em "Pendente cliente"/outros status, fora do expediente,
 * e quando o ticket está com alguém de fora do time (ex.: DEV).
 *
 * Reutiliza calcHorasUteis (mesma janela de horário comercial do resto do app).
 */
const HORA_INICIO = Number(process.env.HORA_INICIO_UTIL ?? 8);
const HORA_FIM = Number(process.env.HORA_FIM_UTIL ?? 18);

/**
 * Horas úteis (seg–sex, 08h–18h) entre dois instantes.
 * Os timestamps representam o horário BRT do portal codificado em UTC
 * (ts = Date.UTC(ano, mês, dia, horaBRT, min)), então usamos métodos UTC —
 * assim o cálculo independe do fuso da máquina que roda (sandbox/Actions/Vercel).
 */
export function bizHoras(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  let total = 0;
  let cur = startMs;
  const DAY = 86_400_000;
  while (cur < endMs) {
    const d = new Date(cur);
    const y = d.getUTCFullYear(), mo = d.getUTCMonth(), da = d.getUTCDate(), wd = d.getUTCDay();
    const dayStart = Date.UTC(y, mo, da, HORA_INICIO);
    const dayEnd = Date.UTC(y, mo, da, HORA_FIM);
    const segEnd = Math.min(endMs, dayEnd);
    if (wd >= 1 && wd <= 5) {
      const lo = Math.max(cur, dayStart);
      const hi = Math.min(segEnd, dayEnd);
      if (hi > lo) total += (hi - lo) / 3_600_000;
    }
    cur = Date.UTC(y, mo, da, 0, 0) + DAY + HORA_INICIO * 3_600_000; // próximo dia 08h
  }
  return Math.round(total * 100) / 100;
}

/** Um trâmite do histórico do ticket, já normalizado. ts = Date.UTC(...,horaBRT,min). */
export interface Tramite {
  ts: number;
  status: string | null;       // status definido por este trâmite (ou null se não mudou)
  assumido: string | null;     // login que assumiu o ticket neste trâmite
  transfPara: string | null;   // login para quem foi transferido neste trâmite
}

/** Roster: grupo -> conjunto de logins considerados membros do time. */
export type Roster = Record<string, Set<string>>;

const EM_ANDAMENTO = 'Em andamento';

/**
 * Constrói o roster a partir do histórico de tickets: um consultor é "membro"
 * de um grupo se foi responsável final de pelo menos `minTickets` tickets nele.
 * Isso exclui pessoas de fora (ex.: DEV) que raramente aparecem como responsável.
 */
export function buildRoster(
  tickets: { grupo: string; consultor: string }[],
  minTickets = 20,
): Roster {
  const cnt: Record<string, Record<string, number>> = {};
  for (const t of tickets) {
    if (!t.consultor || !t.grupo) continue;
    (cnt[t.grupo] ??= {})[t.consultor] = ((cnt[t.grupo] ??= {})[t.consultor] ?? 0) + 1;
  }
  const roster: Roster = {};
  for (const g of Object.keys(cnt)) {
    roster[g] = new Set(
      Object.entries(cnt[g]).filter(([, n]) => n >= minTickets).map(([p]) => p),
    );
  }
  return roster;
}

/**
 * Calcula o SLA (tempo útil sob o time) em horas úteis, a partir do histórico.
 * @param events  trâmites ordenados por ts ascendente
 * @param grupo   Grupo de Atendimento do ticket (define o time)
 * @param roster  mapa grupo -> membros
 * @param nowMs   instante de referência para tickets ainda abertos (padrão: agora)
 */
export function calcSlaTempoUtil(
  events: Tramite[],
  grupo: string,
  roster: Roster,
  nowMs: number = Date.now() - 3 * 3_600_000, // agora em BRT codificado como UTC
): number {
  if (!events.length) return 0;
  const time = roster[grupo] ?? new Set<string>();

  let curStatus: string | null = null;
  let curResp: string | null = null;
  let totalHoras = 0;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.status) curStatus = e.status;
    if (e.assumido) curResp = e.assumido;
    if (e.transfPara) curResp = e.transfPara;

    const startMs = e.ts;
    const endMs = i + 1 < events.length ? events[i + 1].ts : nowMs;

    if (curStatus === EM_ANDAMENTO && curResp && time.has(curResp)) {
      totalHoras += bizHoras(startMs, endMs);
    }
  }
  return Math.round(totalHoras * 100) / 100;
}

// Observação: a extração dos trâmites do DOM (page.evaluate) fica no coletor
// (scripts/collect.ts), produzindo objetos Tramite com ts = Date.UTC(...,horaBRT,min).
