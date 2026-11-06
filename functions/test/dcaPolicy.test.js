import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DCA_POLICY, dcaCapFraction, tiltNote, normalizeInstallments, buyBudgetUsd, tranchePlan, pacingNote, cadenceStatus, cadenceWaitText, cadenceDueText, withBuyZoneBypass, cadenceSummary } from '../src/services/dcaPolicy.js';
import { modulation } from '../src/backtest/dcaSim.js';

test('el mapeo desplegado es exactamente el evaluado en el backtest (modulation con los mismos parámetros)', () => {
  for (const score of [-1, -0.5, -0.1, 0, 0.2, 0.7, 1]) {
    const m = modulation(score, DCA_POLICY.tilt);
    assert.equal(dcaCapFraction(score).multiplier, Math.round(m * 1000) / 1000);
  }
  assert.deepEqual({ ...DCA_POLICY.tilt }, { k: 0.5, min: 0.5, max: 1.5, dir: -1 });   // idéntico a `policy_score` de run.js
});

test('score bajo ⇒ multiplicador > 1 y fracción mayor; monotónica decreciente en el score', () => {
  let prev = Infinity;
  for (let s = -1; s <= 1.0001; s += 0.1) {
    const f = dcaCapFraction(s).capFraction;
    assert.ok(f <= prev + 1e-9, `no monotónica en ${s}`);
    prev = f;
  }
  assert.ok(dcaCapFraction(-0.6).multiplier > 1 && dcaCapFraction(0.6).multiplier < 1);
});

test('límites: fracción entre min y max, sin exceder el 100 % del efectivo', () => {
  for (const s of [-5, -1, 0, 1, 5]) {
    const f = dcaCapFraction(s).capFraction;
    assert.ok(f >= DCA_POLICY.minFraction && f <= DCA_POLICY.maxFraction, `${s} → ${f}`);
  }
  assert.equal(dcaCapFraction(0).capFraction, DCA_POLICY.baseFraction);
});

test('score no finito o ausente ⇒ neutro (base, ×1) sin romper', () => {
  for (const s of [NaN, undefined, null, 'x']) {
    const r = dcaCapFraction(s);
    assert.equal(r.multiplier, 1);
    assert.equal(r.capFraction, DCA_POLICY.baseFraction);
    assert.equal(r.score, null);
  }
});

test('tiltNote: describe el ajuste con honestidad (efecto chico) y no dice nada si es ×1', () => {
  assert.match(tiltNote({ multiplier: 1.2 }), /×1\.20/);
  assert.match(tiltNote({ multiplier: 1.2 }), /efecto chico/);
  assert.match(tiltNote({ multiplier: 0.8 }), /×0\.80/);
  assert.equal(tiltNote({ multiplier: 1 }), '');
});

// ── p3-2: ritmo de compra ───────────────────────────────────────────────────────

test('p3-2: la cuota base es 1/N de los USDT y el tilt acotado (el evaluado) la modula', () => {
  assert.equal(DCA_POLICY.version, 'p3-4');
  assert.equal(DCA_POLICY.baseFraction, 0.25);
  for (const n of [1, 2, 4, 8, 12]) {
    const r = dcaCapFraction(0, { installments: n });
    assert.equal(r.installments, n);
    assert.equal(r.capFraction, Math.round((1 / n) * 1000) / 1000);          // score neutro ⇒ exactamente 1/N
  }
  // el caso real: score −0.59 con 4 compras ⇒ ×1.295 sobre el 25 % (antes: 97 % de TODO el efectivo)
  const r = dcaCapFraction(-0.59);
  assert.equal(r.multiplier, 1.295);
  assert.equal(r.capFraction, 0.324);
});

test('p3-2: con la cuota por defecto ninguna señal pasa del 37.5 % (25 % × el tope del tilt 1.5)', () => {
  for (let s = -3; s <= 3; s += 0.1) assert.ok(dcaCapFraction(s).capFraction <= 0.375 + 1e-9, `score ${s}`);
  assert.equal(dcaCapFraction(-3).capFraction, 0.375);
  assert.equal(dcaCapFraction(3).capFraction, 0.125);                          // y no baja de ×0.5
});

test('p3-2: una sola compra reproduce el comportamiento anterior (hasta el 100 %) y N altos no bajan del piso', () => {
  assert.equal(dcaCapFraction(-1, { installments: 1 }).capFraction, 1);        // clamp a 100 %
  assert.ok(dcaCapFraction(1, { installments: 12 }).capFraction >= DCA_POLICY.minFraction);
});

test('p3-2: sin tilt (BTC/ETH) el multiplicador es ×1 y el score no se registra', () => {
  const r = dcaCapFraction(-0.9, { tilt: false });
  assert.equal(r.multiplier, 1);
  assert.equal(r.capFraction, 0.25);
  assert.equal(r.score, null);
  assert.equal(r.tilt, false);
});

test('normalizeInstallments: entero 1–12; ausente o inválido ⇒ 4', () => {
  assert.equal(normalizeInstallments(undefined), 4);
  assert.equal(normalizeInstallments(null), 4);
  assert.equal(normalizeInstallments(''), 4);
  assert.equal(normalizeInstallments('abc'), 4);
  assert.equal(normalizeInstallments(NaN), 4);
  assert.equal(normalizeInstallments('6'), 6);
  assert.equal(normalizeInstallments(5.6), 6);
  assert.equal(normalizeInstallments(0), 1);
  assert.equal(normalizeInstallments(-3), 1);
  assert.equal(normalizeInstallments(500), 12);
});

test('buyBudgetUsd: cuota × efectivo, con piso (una orden mínima) y techo (el efectivo)', () => {
  assert.equal(buyBudgetUsd(333, 0.324), 333 * 0.324);
  assert.equal(buyBudgetUsd(30, 0.25), 10);                 // 7.5 → piso de una orden mínima
  assert.equal(buyBudgetUsd(6, 0.25), 6);                   // no alcanza ni la mínima: todo lo que hay (después se descarta por costos)
  assert.equal(buyBudgetUsd(100, 5), 100);                  // nunca más que el efectivo
  assert.equal(buyBudgetUsd(0, 0.25), 0);
  assert.equal(buyBudgetUsd(-5, 0.25), 0);
  assert.equal(buyBudgetUsd(1000, NaN), 10);                // fracción inválida ⇒ solo el piso
  assert.equal(buyBudgetUsd(100, 0.1, 25), 25);             // mínimo configurable
});

test('tranchePlan: 3 tramos si el más chico llega al mínimo, si no 2, si no 1; sin capital se muestra el plan en %', () => {
  assert.deepEqual(tranchePlan(250), [0.3, 0.3, 0.4]);
  assert.deepEqual(tranchePlan(34), [0.3, 0.3, 0.4]);       // 0.3 × 34 = 10.2
  assert.deepEqual(tranchePlan(33), [0.4, 0.6]);            // 0.3 × 33 = 9.9 < 10
  assert.deepEqual(tranchePlan(25), [0.4, 0.6]);
  assert.deepEqual(tranchePlan(24), [1]);                   // 0.4 × 24 = 9.6 < 10
  assert.deepEqual(tranchePlan(10), [1]);
  assert.deepEqual(tranchePlan(1000, 2), [0.4, 0.6]);       // esquema por % con poco efectivo: máximo 2
  assert.deepEqual(tranchePlan(0), [0.3, 0.3, 0.4]);        // sin capital cargado: plan en %
  assert.deepEqual(tranchePlan(0, 2), [0.4, 0.6]);
  for (const b of [0, 5, 24, 40, 500]) assert.equal(Math.round(tranchePlan(b).reduce((a, w) => a + w, 0) * 100), 100);   // siempre suma 100 %
});

test('pacingNote: dice cuánto se usa y cuánto queda de reserva; calla sin efectivo o con una sola compra', () => {
  const t = pacingNote({ cashUsd: 333, fraction: 0.324, installments: 4 });
  assert.match(t, /~4 compras/);
  assert.match(t, /esta usa el 32 % \(\$108 de \$333\)/);
  assert.match(t, /\$225\) queda de reserva/);
  assert.equal(pacingNote({ cashUsd: 0, fraction: 0.25, installments: 4 }), '');
  assert.equal(pacingNote({ cashUsd: 333, fraction: 1, installments: 1 }), '');
  assert.match(pacingNote({ cashUsd: 30, fraction: 0.25, installments: 4 }), /esta usa el 33 % \(\$10 de \$30\)/);   // el piso se refleja
});

// ── p3-3: cadencia (una compra por semana; la señal deja de ser "COMPRAR" permanente) ─────────────────

const NOW0 = Date.parse('2026-11-06T15:00:00Z');
const DAYS = (n) => n * 86400000;
const buyOn = (daysAgo, price = 3923) => ({ date: new Date(NOW0 - DAYS(daysAgo)).toISOString().slice(0, 10), price, amount_usd: 100 });
const cadenceOf = (buys, price = 3923, now = NOW0) => cadenceStatus({ buys, price, now });

test('cadencia: sin compras registradas toca comprar (primera)', () => {
  const c = cadenceOf([]);
  assert.equal(c.due, true);
  assert.equal(c.reason, 'first');
  assert.equal(cadenceOf(undefined).due, true);
  assert.equal(cadenceOf([{ date: 'basura', price: 1 }, { date: '2026-11-01', price: 0 }]).reason, 'first');   // datos inválidos se ignoran
});

test('cadencia: compró hace poco ⇒ espera con la fecha de la próxima; a los 7 días toca; el borde exacto cuenta', () => {
  const c = cadenceOf([buyOn(2)]);
  assert.equal(c.due, false);
  assert.equal(c.reason, 'recent');
  assert.ok(c.daysSince > 1.5 && c.daysSince < 2.5);
  assert.equal(new Date(c.nextAt).toISOString().slice(0, 10), '2026-11-11');              // compra del 4-nov (12:00 UTC) + 7 días
  assert.equal(cadenceOf([buyOn(6)]).due, false);
  assert.equal(cadenceOf([buyOn(7)], 3923, NOW0 + 3 * 3600e3).reason, 'due');             // 7 días pasaditos del mediodía de la compra
  assert.equal(cadenceOf([buyOn(9)]).reason, 'due');
});

test('cadencia: una caída de 3 % o más bajo la última compra adelanta la próxima', () => {
  const buys = [buyOn(2, 4000)];
  assert.equal(cadenceOf(buys, 3900).due, false);                  // −2.5 %
  const dip = cadenceOf(buys, 3880);                                // −3 % exacto
  assert.equal(dip.due, true);
  assert.equal(dip.reason, 'dip');
  assert.equal(dip.dipPrice, 3880);
  assert.equal(cadenceOf(buys, 3700).reason, 'dip');
  assert.equal(cadenceOf(buys, 4100).due, false);                  // subió: no hay mejor entrada
});

test('cadencia: usa la compra MÁS NUEVA (sin importar el orden) y acota fechas futuras al presente', () => {
  const c = cadenceOf([buyOn(20), buyOn(1), buyOn(10)]);
  assert.equal(c.due, false);
  assert.ok(c.daysSince < 2);
  const future = cadenceOf([{ date: new Date(NOW0 + DAYS(30)).toISOString().slice(0, 10), price: 3923 }]);
  assert.equal(future.due, false);                                  // un reloj adelantado no habilita comprar antes
  assert.ok(future.daysSince >= 0);
});

test('cadenceWaitText / cadenceDueText / cadenceSummary: textos y resumen serializable', () => {
  const wait = cadenceWaitText(cadenceOf([buyOn(3, 3950)]));
  assert.match(wait.reason, /Ya compraste hace 3 días \(\$3,950\): la próxima compra toca desde el 10 nov/);
  assert.match(wait.recommendation, /una compra por semana.*o antes si el precio baja a \$3,832 \(3 % por debajo de tu última compra\)/);
  assert.match(cadenceWaitText(cadenceOf([buyOn(0)])).reason, /Ya compraste hoy/);
  assert.match(cadenceWaitText(cadenceOf([buyOn(1)])).reason, /Ya compraste ayer/);
  assert.equal(cadenceWaitText(cadenceOf([])), null);
  assert.equal(cadenceDueText(cadenceOf([])), '');
  assert.match(cadenceDueText(cadenceOf([buyOn(8)])), /Toca la compra de la semana/);
  assert.match(cadenceDueText(cadenceOf([buyOn(2, 4000)], 3800)), /Toca antes de lo previsto.*bajó 3 % o más/);
  const s = cadenceSummary(cadenceOf([buyOn(3, 3950)]));
  assert.equal(s.due, false);
  assert.equal(typeof s.nextAt, 'string');
  assert.equal(s.lastBuyPrice, 3950);
  assert.doesNotThrow(() => JSON.stringify(s));
  assert.equal(cadenceSummary(null), null);
});

// ── p3-4: en zona de compra el ritmo no frena ────────────────────────────────────────────────────────
test('p3-4: withBuyZoneBypass levanta SOLO el freno por ritmo y solo en zona de compra', () => {
  const NOW = Date.parse('2026-11-06T15:00:00Z');
  const recent = cadenceStatus({ buys: [{ date: '2026-11-03', price: 3950 }], price: 3923, now: NOW });
  assert.equal(recent.due, false);
  const z = withBuyZoneBypass(recent, 'buy');
  assert.equal(z.due, true);
  assert.equal(z.reason, 'zone');
  assert.equal(z.lastBuy.price, 3950);                                   // conserva los datos de la última compra
  // fuera de la zona no cambia nada
  assert.equal(withBuyZoneBypass(recent, 'neutral'), recent);
  assert.equal(withBuyZoneBypass(recent, 'sell'), recent);
  assert.equal(withBuyZoneBypass(recent, undefined), recent);
  // si ya tocaba comprar (semana, caída o primera) se deja el motivo original
  const due = cadenceStatus({ buys: [{ date: '2026-10-20', price: 3950 }], price: 3923, now: NOW });
  assert.equal(withBuyZoneBypass(due, 'buy').reason, 'due');
  assert.equal(withBuyZoneBypass(cadenceStatus({ buys: [], price: 1, now: NOW }), 'buy').reason, 'first');
  assert.equal(withBuyZoneBypass(null, 'buy'), null);
  // el interruptor: con buyZoneBypass en false el ritmo manda siempre
  const off = { ...DCA_POLICY, cadence: { ...DCA_POLICY.cadence, buyZoneBypass: false } };
  assert.equal(withBuyZoneBypass(recent, 'buy', off), recent);
  assert.equal(DCA_POLICY.cadence.buyZoneBypass, true);
});

test('p3-4: el texto de la zona dice que se puede sumar y que los tramos ejecutados no se repiten', () => {
  const NOW = Date.parse('2026-11-06T15:00:00Z');
  const z = withBuyZoneBypass(cadenceStatus({ buys: [{ date: '2026-11-05', price: 3950 }], price: 3923, now: NOW }), 'buy');
  assert.match(cadenceDueText(z), /^ Estás en zona de compra: se puede sumar aunque ya compraste ayer \(los tramos que ya ejecutaste no se repiten\)\./);
  assert.equal(cadenceSummary(z).reason, 'zone');
  assert.equal(cadenceSummary(z).due, true);
});
