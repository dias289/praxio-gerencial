/** Testes do SLA "tempo útil sob o time". Rode: npx tsx scripts/test-sla.ts */
import { calcSlaTempoUtil, buildRoster, type Tramite } from '../lib/sla-tempo-util.js';

// helper: cria um trâmite a partir de horário BRT
function ev(y: number, mo: number, d: number, h: number, mi: number, status: string | null, assumido: string | null = null, transfPara: string | null = null): Tramite {
  return { ts: Date.UTC(y, mo - 1, d, h, mi), status, assumido, transfPara };
}

let pass = 0, fail = 0;
function eq(name: string, got: number, exp: number, tol = 0.02) {
  const ok = Math.abs(got - exp) <= tol;
  console.log(`${ok ? '✅' : '❌'} ${name}: got ${got}h, esperado ${exp}h`);
  ok ? pass++ : fail++;
}

const roster = { G: new Set(['ALICE']) }; // ALICE é do time G; BOB não

// Ex1: ter 10h->12h Em andamento sob ALICE = 2h
eq('Ex1 (2h, no time)', calcSlaTempoUtil([
  ev(2026, 7, 7, 10, 0, 'Em andamento', 'ALICE'),
  ev(2026, 7, 7, 12, 0, 'Pendente cliente'),
], 'G', roster), 2);

// Fora do time: BOB Em andamento -> não conta
eq('Fora do time (0h)', calcSlaTempoUtil([
  ev(2026, 7, 7, 10, 0, 'Em andamento', 'BOB'),
  ev(2026, 7, 7, 12, 0, 'Pendente cliente'),
], 'G', roster), 0);

// Ex2: qui 16h -> sex 10h = 4h (2h qui + 2h sex)
eq('Ex2 (4h, cruza expediente)', calcSlaTempoUtil([
  ev(2026, 7, 9, 16, 0, 'Em andamento', 'ALICE'),
  ev(2026, 7, 10, 10, 0, 'Pendente cliente'),
], 'G', roster), 4);

// Ex4: sex 17h -> seg 9h = 2h (1h sex + 1h seg), fim de semana não conta
eq('Ex4 (2h, cruza fim de semana)', calcSlaTempoUtil([
  ev(2026, 7, 10, 17, 0, 'Em andamento', 'ALICE'),
  ev(2026, 7, 13, 9, 0, 'Pendente cliente'),
], 'G', roster), 2);

// Ex3: pausa por pendente cliente no meio
eq('Ex3 (2h com pausa pendente)', calcSlaTempoUtil([
  ev(2026, 7, 6, 9, 0, 'Em andamento', 'ALICE'),
  ev(2026, 7, 6, 10, 0, 'Pendente cliente'),
  ev(2026, 7, 6, 14, 0, 'Em andamento', 'ALICE'),
  ev(2026, 7, 6, 15, 0, 'Pendente cliente'),
], 'G', roster), 2);

// Transferência para fora do time no meio: só conta o tempo sob ALICE
eq('Transfer p/ fora (1h)', calcSlaTempoUtil([
  ev(2026, 7, 7, 9, 0, 'Em andamento', 'ALICE'),          // 9-10 conta
  ev(2026, 7, 7, 10, 0, 'Em andamento', null, 'BOB'),      // 10-11 fora do time
  ev(2026, 7, 7, 11, 0, 'Pendente cliente'),
], 'G', roster), 1);

// buildRoster: threshold exclui quem tem poucos tickets
const r = buildRoster([
  ...Array(50).fill(0).map(() => ({ grupo: 'G', consultor: 'ALICE' })),
  ...Array(5).fill(0).map(() => ({ grupo: 'G', consultor: 'BOB' })),  // DEV, poucos
], 20);
console.log(`${r.G.has('ALICE') && !r.G.has('BOB') ? '✅' : '❌'} buildRoster: ALICE membro, BOB fora`);
r.G.has('ALICE') && !r.G.has('BOB') ? pass++ : fail++;

console.log(`\n${fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHARAM'} (${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
