import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSignalState, buildNotification, CONFIRM_READINGS, COOLDOWN_MS } from '../src/services/signalAlert.js';

const H = 3600 * 1000;
const run = (seq, times) => {
  let s = null;
  return seq.map((a, i) => { const r = nextSignalState(s, a, times ? times[i] : i * H); s = r.state; return r.push; });
};

// ── máquina de estado ────────────────────────────────────────────────────────

test('COMPRAR: la primera lectura no avisa; la segunda consecutiva sí; después no se repite mientras siga igual', () => {
  assert.equal(CONFIRM_READINGS, 2);
  assert.deepEqual(run(['BUY', 'BUY', 'BUY', 'BUY']), [false, true, false, false]);
});

test('ESPERAR nunca avisa y reinicia la racha', () => {
  assert.deepEqual(run(['WAIT', 'WAIT', 'WAIT']), [false, false, false]);
  let s = nextSignalState(null, 'BUY', 0).state;
  const r = nextSignalState(s, 'WAIT', H);
  assert.equal(r.push, false);
  assert.equal(r.state.streak, 1);
});

test('VENDER también avisa (una vez por racha)', () => {
  assert.deepEqual(run(['SELL', 'SELL', 'SELL']), [false, true, false]);
});

test('flapping COMPRAR→ESPERAR→COMPRAR dentro del enfriamiento (12 h) no reenvía; pasado el enfriamiento sí', () => {
  assert.equal(COOLDOWN_MS, 12 * H);
  assert.deepEqual(run(['BUY', 'BUY', 'WAIT', 'BUY', 'BUY']), [false, true, false, false, false]);
  const times = [0, H, 2 * H, 13 * H, 14 * H];
  assert.deepEqual(run(['BUY', 'BUY', 'WAIT', 'BUY', 'BUY'], times), [false, true, false, false, true]);
});

test('el caso de la revisión: COMPRAR, compra registrada (ESPERAR una semana), vuelve a tocar ⇒ un aviso por compra, no uno por hora', () => {
  const seq = [], times = [];
  for (let h = 0; h < 15 * 24; h++) {
    // día 0–1: toca (el usuario compra el día 1); días 1–8: espera; día 8–9: toca otra vez; día 9–15: espera
    const day = h / 24;
    seq.push((day < 1 || (day >= 8 && day < 9)) ? 'BUY' : 'WAIT');
    times.push(h * H);
  }
  assert.equal(run(seq, times).filter(Boolean).length, 2);
});

test('acepta el estado guardado sin racha ni último aviso', () => {
  const r = nextSignalState({ action: 'BUY' }, 'BUY', 5 * H);
  assert.equal(r.state.streak, 2);
  assert.equal(r.push, true);
});

// ── texto del aviso ──────────────────────────────────────────────────────────

const buyDecision = (cadence) => ({
  action: 'BUY', reason: 'Precio 18.0% por debajo del promedio · promedio de compra $4,774',
  operations: [
    { type: 'BUY', usdAmount: 32.4, price: 3923 }, { type: 'BUY', usdAmount: 32.4, price: 3864 }, { type: 'BUY', usdAmount: 43.2, price: 3811 }
  ],
  cadence
});

test('aviso de compra: título según el motivo y cuerpo con monto, % de los USDT, tramos y motivo', () => {
  const due = buildNotification(buyDecision({ reason: 'due' }), { symbol: 'PAXG', price: 3923, cashUsd: 333 });
  assert.equal(due.title, 'PAXG: toca la compra de la semana');
  assert.match(due.body, /^Usá \$108 \(32 % de tus \$333\) en 3 tramos: \$32 ahora a \$3,923 · \$32 a \$3,864 · \$43 a \$3,811\./);
  assert.match(due.body, /\nPrecio 18\.0% por debajo del promedio$/);
  assert.equal(due.tag, 'signal_PAXG');
  assert.deepEqual(due.data, { kind: 'signal', symbol: 'PAXG', action: 'BUY', tag: 'signal_PAXG' });

  const first = buildNotification(buyDecision({ reason: 'first' }), { symbol: 'PAXG', price: 3923, cashUsd: 333 });
  assert.equal(first.title, 'PAXG: toca comprar');

  const dip = buildNotification(buyDecision({ reason: 'dip', lastBuyPrice: 4000 }), { symbol: 'PAXG', price: 3860, cashUsd: 333 });
  assert.equal(dip.title, 'PAXG: bajó 3.5 % — conviene adelantar la compra');
});

test('dos avisos de compra distintos NO dicen lo mismo (monto, motivo y precios cambian el texto)', () => {
  const a = buildNotification(buyDecision({ reason: 'due' }), { symbol: 'PAXG', price: 3923, cashUsd: 333 });
  const b = buildNotification({ ...buyDecision({ reason: 'dip', lastBuyPrice: 4100 }), reason: 'Precio 20.0% por debajo del promedio', operations: [{ type: 'BUY', usdAmount: 54, price: 3790 }] }, { symbol: 'PAXG', price: 3790, cashUsd: 216 });
  assert.notEqual(a.title, b.title);
  assert.notEqual(a.body, b.body);
});

test('aviso de venta y casos sin aviso', () => {
  const sell = buildNotification({ action: 'SELL', reason: 'Zona de distribución con ganancia significativa', operations: [{ type: 'SELL', percentage: 30 }] }, { symbol: 'PAXG', price: 5400 });
  assert.equal(sell.title, 'PAXG: señal de venta parcial');
  assert.match(sell.body, /^Vender 30 % de la posición cerca de \$5,400\./);
  assert.equal(buildNotification({ action: 'WAIT' }, { symbol: 'PAXG', price: 1 }), null);
  assert.equal(buildNotification(null, { symbol: 'PAXG', price: 1 }), null);
  assert.equal(buildNotification({ action: 'BUY', operations: [{ type: 'BUY', usdAmount: null, price: 3900 }] }, { symbol: 'PAXG', price: 3900 }), null);   // sin montos no es accionable
});
