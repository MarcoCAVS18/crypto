import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDecision } from '../src/services/decisionEngine.js';

const on  = { mode: 'risk_on',  score: 0.6,  reasons: ['x'] };
const off = { mode: 'risk_off', score: -0.5, reasons: ['Dólar fuerte'] };
const neutral = { mode: 'neutral', score: 0, reasons: [] };
const st = (cash, mode = 'inversion', totalCapital = 20000) => ({ cashPercent: cash, mode, totalCapital });
const ind = { rsi: 55, atr: 9 };

// Zonas derivadas solo del ATR (sin swings) y zonas con estructura real
const atrZones = (price, currentZone = 'neutral') => ({
  buy:     { min: price * 0.9965, max: price * 0.9985, reason: 'Zona basada en ATR' },
  neutral: { min: price * 0.9985, max: price * 1.0015 },
  sell:    { min: price * 1.0015, max: price * 1.0035, reason: 'Zona basada en ATR' },
  currentZone
});
const swingZones = (price, currentZone = 'neutral') => ({
  buy:     { min: price * 0.97, max: price * 0.985, reason: 'Swing low reciente' },
  neutral: { min: price * 0.985, max: price * 1.02 },
  sell:    { min: price * 1.02, max: price * 1.04, reason: 'Swing high previo' },
  currentZone
});

// Posición cuyo P&L actual es `pnl` %
const position = (price, pnl, extra = {}) => {
  const avg = price / (1 + pnl / 100);
  return { hasPosition: true, avgBuyPrice: avg, costBasis: avg, netInvested: avg, units: 1, executedBuys: [], ...extra };
};

// ── B5: el cash bajo no bloquea ventas ──────────────────────────────────────

test('B5: con +50 % de ganancia y zona de venta, cash 5 % SÍ permite vender', () => {
  const price = 6000;
  const d = makeDecision(on, atrZones(price, 'sell'), price, st(5), ind, 'PAXG', position(price, 50));
  assert.equal(d.action, 'SELL');
  assert.equal(d.strength, 'fuerte');
});

test('B5: con cash 5 % una COMPRA sigue bloqueada', () => {
  const price = 4000;
  const d = makeDecision(on, atrZones(price, 'buy'), price, st(5), ind, 'PAXG', null);
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /Sin cash suficiente/);
  assert.deepEqual(d.operations, []);
});

// ── B5: risk_off ────────────────────────────────────────────────────────────

test('B5: risk_off + ganancia significativa + zona de venta → recorte (núcleo protegido en PAXG)', () => {
  const price = 6000; // +50 %
  const d = makeDecision(off, atrZones(price, 'sell'), price, st(40), ind, 'PAXG', position(price, 50));
  assert.equal(d.action, 'SELL');
  assert.match(d.reason, /Risk OFF/);
  assert.equal(d.operations.length, 1);           // PAXG: sin segunda venta (núcleo)
  assert.equal(d.operations[0].percentage, 50);
});

test('B5: risk_off sin ganancia suficiente → WAIT con el motivo de Risk OFF', () => {
  const price = 4400; // +10 %
  const d = makeDecision(off, atrZones(price, 'sell'), price, st(40), ind, 'PAXG', position(price, 10));
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /Risk OFF: Dólar fuerte/);
});

test('B5: risk_off sin zona de compra ni caída bajo el promedio → WAIT; en BTC risk_off nunca compra', () => {
  const price = 4000;
  assert.equal(makeDecision(off, atrZones(6000, 'neutral'), 6000, st(60), ind, 'PAXG', position(6000, 50)).action, 'WAIT');
  assert.equal(makeDecision(off, atrZones(price, 'buy'), price, st(60), ind, 'BTC', null).action, 'WAIT');   // la política de DCA es solo de PAXG
});

// ── P3: política de DCA de PAXG (respaldada por backtest, ver dcaPolicy.js) ─────

test('P3: PAXG en risk_off + zona de compra SIGUE acumulando (antes: WAIT, lo que encareció el promedio)', () => {
  const price = 4000;
  const d = makeDecision(off, atrZones(price, 'buy'), price, st(60), ind, 'PAXG', null);
  assert.equal(d.action, 'BUY');
  assert.equal(d.strength, 'moderado');
  assert.ok(d.operations.length >= 2);
  assert.ok(d.operations.every(o => o.usdAmount > 0));
  assert.equal(d.policy.version, 'p3-3');
  assert.equal(d.policy.installments, 4);
  assert.ok(d.policy.multiplier > 1, 'score bajo ⇒ tilt hacia comprar la debilidad');
  assert.match(d.recommendation, /Tamaño ajustado ×/);
});

test('P3: en risk_off también acumula si el precio está bajo el promedio (aunque no esté en zona de compra)', () => {
  const price = 4000;
  const d = makeDecision(off, atrZones(price, 'neutral'), price, st(60), ind, 'PAXG', position(price, -10));
  assert.equal(d.action, 'BUY');
});

test('P3: límites en risk_off — poco efectivo ⇒ WAIT; la concentración YA NO frena (decisión del usuario); vender sigue funcionando', () => {
  const price = 4000;
  // posición enorme (costo = 90 % del capital): ya no hay tope de concentración, compra igual
  assert.equal(makeDecision(off, atrZones(price, 'buy'), price, st(60, 'inversion', 20000), ind, 'PAXG', position(price, -5, { costBasis: 18000, netInvested: 18000 })).action, 'BUY');
  // efectivo insuficiente (<30 %)
  assert.equal(makeDecision(off, atrZones(price, 'buy'), price, st(25), ind, 'PAXG', null).action, 'WAIT');
  // vender sigue funcionando con macro adverso y ganancia
  const sell = makeDecision(off, atrZones(6000, 'sell'), 6000, st(60), ind, 'PAXG', position(6000, 50));
  assert.equal(sell.action, 'SELL');
});

test('P3: el tamaño NO sigue al score: score bajo despliega ≥ que score alto (antes ocurría lo contrario)', () => {
  const price = 4000;
  const amount = (mode) => makeDecision(mode, atrZones(price, 'buy'), price, st(60), ind, 'PAXG', null).operations.reduce((a, o) => a + o.usdAmount, 0);
  const low  = amount({ mode: 'risk_on', score: 0.30, reasons: [] });
  const high = amount({ mode: 'risk_on', score: 0.90, reasons: [] });
  assert.ok(low >= high, `score bajo ${low} vs alto ${high}`);
  // rangos: nunca más del 100 % del efectivo asignado
  const cash = 20000 * 0.6;
  assert.ok(amount({ mode: 'risk_off', score: -1, reasons: [] }) <= cash + 1e-6);
});

test('P3: BTC no recibe el tilt de score de PAXG (no hay evidencia): solo el ritmo de compra, con multiplicador ×1', () => {
  const price = 60000;
  const d = makeDecision(on, atrZones(price, 'buy'), price, st(60), ind, 'BTC', null);
  assert.equal(d.action, 'BUY');
  assert.equal(d.policy.tilt, false);
  assert.equal(d.policy.multiplier, 1);
  assert.equal(d.policy.score, null);
});

test('B5: observación y trading en risk_off siguen en WAIT', () => {
  const price = 6000;
  assert.match(makeDecision(off, atrZones(price, 'sell'), price, st(40, 'observacion'), ind, 'PAXG', position(price, 50)).reason, /observación/);
  assert.match(makeDecision(off, atrZones(price, 'sell'), price, st(40, 'trading'), ind, 'PAXG', position(price, 50)).reason, /Risk OFF/);
});

// ── B8: el mensaje usa el umbral real de PAXG (30 %) ────────────────────────

test('B8: PAXG en zona de venta con +26 % pide subir 4.0 % más (no "-1.0 %")', () => {
  const price = 5000;
  const d = makeDecision(on, atrZones(price, 'sell'), price, st(60), ind, 'PAXG', position(price, 26));
  assert.equal(d.action, 'WAIT');
  assert.match(d.recommendation, /subir un 4\.0% adicional/);
  assert.doesNotMatch(d.recommendation, /-\d/);
});

test('B8: PAXG +20 % → 10 puntos; BTC (umbral 25 %) +20 % → 5 puntos', () => {
  const price = 5000;
  const paxg = makeDecision(on, atrZones(price, 'sell'), price, st(60), ind, 'PAXG', position(price, 20));
  const btc  = makeDecision(on, atrZones(price, 'sell'), price, st(60), ind, 'BTC',  position(price, 20));
  assert.match(paxg.recommendation, /subir un 10\.0%/);
  assert.match(btc.recommendation,  /subir un 5\.0%/);
});

// ── B7: tramos estrictamente descendentes ───────────────────────────────────

test('B7: ruta DCA en zona neutral → tramos descendentes y suman 100 %', () => {
  const price = 4000;
  const d = makeDecision(on, atrZones(price, 'neutral'), price, st(70), ind, 'PAXG', position(price, -5));
  assert.equal(d.action, 'BUY');
  const px = d.operations.map(o => o.price);
  assert.equal(px.length, 3);
  assert.ok(px[0] > px[1] && px[1] > px[2], `no descendente: ${px}`);   // antes: 4000, 3940, 3986
  assert.equal(d.operations.reduce((s, o) => s + o.percentage, 0), 100);
});

test('B7: con soporte estructural más profundo se respeta ese nivel', () => {
  const price = 4000;
  const z = swingZones(price, 'buy');            // buy.min = 3880 < tramo 2 (3940)
  const d = makeDecision(on, z, price, st(70), ind, 'PAXG', null);
  const px = d.operations.map(o => o.price);
  assert.equal(px[2], z.buy.min);
  assert.ok(px[0] > px[1] && px[1] > px[2]);
});

test('B7: con poco cash (2 tramos) también descienden', () => {
  const price = 4000;
  const d = makeDecision(on, atrZones(price, 'buy'), price, st(40), ind, 'PAXG', null);
  const px = d.operations.map(o => o.price);
  assert.equal(px.length, 2);
  assert.ok(px[0] > px[1]);
});

// ── B7: R/R solo con estructura real ────────────────────────────────────────

test('B7: con zonas solo-ATR no se muestra un "R/R estimado" (era siempre ≈0.3)', () => {
  const price = 4000;
  const d = makeDecision(on, atrZones(price, 'neutral'), price, st(70), ind, 'PAXG', position(price, 5));
  assert.doesNotMatch(d.recommendation, /R\/R estimado/);
  assert.match(d.recommendation, /Volatilidad ATR/);
});

test('B7: con swings reales sí se muestra el R/R', () => {
  const price = 4000;
  const d = makeDecision(on, swingZones(price, 'neutral'), price, st(70), ind, 'PAXG', position(price, 5));
  assert.match(d.recommendation, /R\/R estimado \d+\.\d:1/);
});

// ── Ventas coherentes con la recomendación ──────────────────────────────────

test('ventas: el % de las órdenes coincide con el de la recomendación', () => {
  const price = 5400; // +35 % (PAXG: ≥30 % y <45 %)
  const d = makeDecision(on, atrZones(price, 'sell'), price, st(60), ind, 'PAXG', position(price, 35));
  assert.equal(d.action, 'SELL');
  assert.match(d.recommendation, /30% de la posición/);
  assert.equal(d.operations[0].percentage, 30);
  assert.equal(d.operations.length, 1);            // núcleo protegido
});

test('ventas: BTC ofrece segunda toma que nunca vende el resto entero', () => {
  const price = 6000; // +50 % ≥ 40 % → fuerte
  const d = makeDecision(on, atrZones(price, 'sell'), price, st(60), ind, 'BTC', position(price, 50));
  assert.equal(d.action, 'SELL');
  assert.equal(d.operations[0].percentage, 50);
  assert.equal(d.operations[1].percentage, 25);
  assert.ok(d.operations.reduce((s, o) => s + o.percentage, 0) < 100);   // antes: 50 + 50 = 100
});

// ── B1: el motor usa el costo de lo que queda (costBasis) ───────────────────

test('B1: la concentración usa costBasis, no el flujo neto tras vender', () => {
  const price = 4000;
  // 0.7u a costo 4000 → costBasis 2800; netInvested (flujo) 2560; capital 10000
  const pf = { hasPosition: true, avgBuyPrice: 4000, costBasis: 2800, netInvested: 2560, units: 0.7, executedBuys: [] };
  const d = makeDecision(on, atrZones(price, 'buy'), price, st(70, 'inversion', 10000), ind, 'PAXG', pf);
  assert.match(d.reason, /28% de tu capital/);
});

// ── Compatibilidad ──────────────────────────────────────────────────────────

test('neutral sin señal clara sigue en WAIT y sin operaciones', () => {
  const price = 4000;
  const d = makeDecision(neutral, atrZones(price, 'neutral'), price, st(40), ind, 'PAXG', position(price, 3));
  assert.equal(d.action, 'WAIT');
  assert.deepEqual(d.operations, []);
});


// ── P3c: costos, peso objetivo, salidas por régimen, retrocesos históricos ─────

const goldMode = (mode, score, dailyBias) => ({ mode, score, reasons: [], goldContext: { macro: { dailyBias } } });

test('P3c costos: las operaciones llevan costo estimado y la recomendación lo aclara como supuesto', () => {
  const price = 4000;
  const d = makeDecision(on, atrZones(price, 'buy'), price, st(60), ind, 'PAXG', null);
  assert.ok(d.operations.every(o => o.estCostUsd > 0));
  assert.match(d.recommendation, /Costo estimado ≈ \$.*supuesto/);
});

test('P3c costos: si el efectivo no alcanza ni para una orden mínima ⇒ WAIT "monto demasiado chico"', () => {
  const price = 4000;
  const d = makeDecision(on, atrZones(price, 'buy'), price, { cashPercent: 60, mode: 'inversion', totalCapital: 12 }, ind, 'PAXG', null);   // 60 % de 12 = $7.2 < $10
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /demasiado chico/);
});

test('P3c costos: un mínimo configurado por el usuario se respeta (ningún tramo queda por debajo; si no alcanza el efectivo ⇒ WAIT)', () => {
  const price = 4000;
  const ok = makeDecision(on, atrZones(price, 'buy'), price, { ...st(60), costs: { minOrderUsd: 500 } }, ind, 'PAXG', null);
  assert.equal(ok.action, 'BUY');
  assert.ok(ok.operations.every(o => o.usdAmount >= 500));
  const wait = makeDecision(on, atrZones(price, 'buy'), price, { cashPercent: 100, mode: 'inversion', totalCapital: 400, costs: { minOrderUsd: 500 } }, ind, 'PAXG', null);
  assert.equal(wait.action, 'WAIT');
});

test('P3c peso objetivo: sobre la banda con ganancia ⇒ rebalanceo (SELL parcial); en pérdida ⇒ WAIT sin comprar', () => {
  const price = 4000;
  const target = { targetPercent: 20 };                       // banda 15–25 %
  const heavy = { costBasis: 6000, netInvested: 6000 };        // 30 % de 20000
  const up = makeDecision(neutral, atrZones(price, 'neutral'), price, { ...st(60), target }, ind, 'PAXG', position(price, 10, heavy));
  assert.equal(up.action, 'SELL');
  assert.match(up.reason, /Rebalanceo/);
  const down = makeDecision(on, atrZones(price, 'buy'), price, { ...st(60), target }, ind, 'PAXG', position(price, -5, heavy));
  assert.equal(down.action, 'WAIT');
  assert.match(down.reason, /sobre la banda objetivo/);
});

test('P3c peso objetivo: por debajo de la banda acelera el DCA (×1.25 sobre la fracción), dentro no cambia', () => {
  const price = 4000;
  const amount = (userState, pos) => makeDecision(on, atrZones(price, 'buy'), price, userState, ind, 'PAXG', pos).operations.reduce((a, o) => a + o.usdAmount, 0);
  const base = amount(st(60), null);
  const below = amount({ ...st(60), target: { targetPercent: 30 } }, null);    // sin posición ⇒ peso 0 %, por debajo de 25 %
  assert.ok(below > base, `${below} vs ${base}`);
  assert.ok(below <= 20000 * 0.6 + 1e-6);
});

test('P3c salidas: rotura de tendencia larga + macro adverso + ganancia ⇒ SELL 20 % sin necesidad de zona de venta', () => {
  const price = 4000;
  const bear = { longAlignment: 'bear', extension200Pct: -4, rsi: 38, alignment: 'bear' };
  const d = makeDecision(goldMode('risk_off', -0.5, bear), atrZones(price, 'neutral'), price, st(60), ind, 'PAXG', position(price, 20));
  assert.equal(d.action, 'SELL');
  assert.match(d.reason, /Rotura de tendencia larga/);
  // BTC no recibe esta regla
  assert.doesNotMatch(makeDecision(goldMode('risk_off', -0.5, bear), atrZones(price, 'neutral'), price, st(60), ind, 'BTC', position(price, 20)).reason, /Rotura de tendencia larga/);
});

test('P3c retrocesos históricos: con niveles propios los tramos usan esas profundidades (2.º por debajo del 1.º, 3.º por debajo del 2.º)', () => {
  const price = 4000;
  const d = makeDecision(on, atrZones(price, 'buy'), price, st(60), ind, 'PAXG', null, { pullback: { l2Pct: 1.0, l3Pct: 2.5 } });
  const px = d.operations.map(o => o.price);
  assert.equal(px.length, 3);
  assert.ok(Math.abs(px[1] - price * 0.99) < 1e-6);
  assert.ok(px[2] <= price * (1 - 0.025) + 1e-6 && px[2] < px[1]);
});

// ── P3-2: ritmo de compra (los USDT se reparten en N compras; nunca todo de golpe) ─────────────────

// Modo "solo USDT" del cliente: cashPercent = 100 y totalCapital = USDT disponibles
const usdtOnly = (usdt, extra = {}) => ({ cashPercent: 100, mode: 'inversion', totalCapital: usdt, ...extra });
const total = (d) => d.operations.reduce((a, o) => a + o.usdAmount, 0);
const swingBuy = (price) => swingZones(price, 'neutral');

test('P3-2: el caso real — 333 USDT, Risk OFF (−0.59), 18 % bajo el promedio: usa ~un tercio, no el 97 %', () => {
  const price = 3923;
  const mm = { mode: 'risk_off', score: -0.59, reasons: ['Bono 10Y'] };
  const pf = position(price, -18, { units: 1.7, portfolioValueUsd: 7000 });
  const d = makeDecision(mm, swingBuy(price), price, usdtOnly(333), ind, 'PAXG', pf);
  assert.equal(d.action, 'BUY');
  assert.equal(d.policy.version, 'p3-3');
  assert.equal(d.policy.installments, 4);
  assert.ok(Math.abs(d.policy.capFraction - 0.324) < 0.001, `fracción ${d.policy.capFraction}`);
  assert.ok(Math.abs(total(d) - 333 * 0.324) < 1, `total ${total(d)}`);          // ≈ $108 (antes: $323)
  assert.ok(333 - total(d) > 200, 'queda de reserva más de $200');
  assert.deepEqual(d.operations.map(o => o.percentage), [30, 30, 40]);          // 3 tramos: ahora / −1.5 % / profundo
  assert.match(d.recommendation, /Ritmo: tus USDT se reparten en ~4 compras; esta usa el 32 % \(\$108 de \$333\)/);
  assert.match(d.recommendation, /\$225\) queda de reserva/);
});

test('P3-2: con la cuota por defecto NINGUNA señal usa más del 37.5 % del efectivo, sea cual sea el score', () => {
  const price = 4000;
  for (const score of [-1, -0.59, -0.2, 0, 0.3, 0.6, 1]) {
    for (const mode of ['risk_off', 'neutral', 'risk_on']) {
      const d = makeDecision({ mode, score, reasons: [] }, swingBuy(price), price, usdtOnly(1000), ind, 'PAXG', position(price, -12));
      if (d.action !== 'BUY') continue;
      assert.ok(total(d) <= 1000 * 0.375 + 1e-6, `${mode} ${score}: ${total(d)}`);
    }
  }
});

test('P3-2: la cantidad de compras se puede cambiar (8 ⇒ cuota menor; 1 ⇒ todo, como antes) y se sanea', () => {
  const price = 3923;
  const mm = { mode: 'risk_off', score: -0.59, reasons: [] };
  const pf = position(price, -18);
  const amount = (n) => total(makeDecision(mm, swingBuy(price), price, usdtOnly(333, { installments: n }), ind, 'PAXG', pf));
  assert.ok(amount(8) < amount(4) && amount(4) < amount(2) && amount(2) < amount(1) + 1e-6);
  assert.ok(Math.abs(amount(1) - 333) < 1);                                      // 1 compra = todo el efectivo (opt-in explícito)
  assert.equal(amount(undefined), amount(4));                                    // ausente ⇒ 4
  assert.equal(amount('x'), amount(4));                                          // inválido ⇒ 4
  assert.equal(amount(99), amount(12));                                          // se acota a 12
  assert.equal(amount(0), amount(1));                                            // y a 1 como mínimo
});

test('P3-2: BTC/ETH usan el mismo ritmo (antes risk_on pedía el 100 % del efectivo), sin tilt de score', () => {
  const price = 60000;
  const on = { mode: 'risk_on', score: 0.6, reasons: [] };
  const d = makeDecision(on, swingZones(price, 'buy'), price, usdtOnly(1000), ind, 'BTC', null);
  assert.equal(d.action, 'BUY');
  assert.ok(Math.abs(total(d) - 250) < 1, `BTC risk_on: ${total(d)}`);          // 1/4, no el 100 %
  assert.equal(d.policy.tilt, false);
  assert.equal(d.policy.multiplier, 1);
  assert.equal(d.policy.score, null);                                            // sin evidencia de score para BTC/ETH
  const n = makeDecision({ mode: 'neutral', score: 0, reasons: [] }, swingZones(price, 'buy'), price, usdtOnly(1000), ind, 'BTC', null);
  assert.ok(Math.abs(total(n) - 125) < 1, `BTC neutral: ${total(n)}`);          // media cuota
});

test('P3-2: bolsas chicas — los tramos se achican en cantidad para que cada uno llegue al mínimo, y "ahora" nunca se pierde', () => {
  const price = 4000;
  const on = { mode: 'risk_on', score: 0, reasons: [] };
  const run = (usdt) => makeDecision(on, swingBuy(price), price, usdtOnly(usdt), ind, 'PAXG', position(price, -5));
  const big = run(1000);                                                          // 250 ⇒ 3 tramos
  assert.equal(big.operations.length, 3);
  const mid = run(100);                                                           // 25 ⇒ 2 tramos (10 / 15)
  assert.deepEqual(mid.operations.map(o => Math.round(o.usdAmount)), [10, 15]);
  assert.equal(mid.operations[0].price, price);                                   // el de "ahora" sigue estando
  const small = run(30);                                                          // 7.5 < $10 ⇒ piso: una orden mínima
  assert.equal(small.action, 'BUY');
  assert.equal(small.operations.length, 1);
  assert.equal(small.operations[0].usdAmount, 10);
  assert.equal(small.operations[0].price, price);
  for (const d of [big, mid, small]) assert.ok(d.operations.every(o => o.usdAmount >= 10), 'ningún tramo bajo el mínimo');
});

test('P3-2: sin llegar a una orden mínima de efectivo no se compra (con motivo claro)', () => {
  const price = 4000;
  const d = makeDecision({ mode: 'risk_on', score: 0, reasons: [] }, swingBuy(price), price, usdtOnly(6), ind, 'PAXG', position(price, -5));
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /demasiado chico/);
});

test('P3-2: la nota de ritmo no aparece sin efectivo cargado ni con una sola compra', () => {
  const price = 4000;
  const mm = { mode: 'risk_on', score: 0, reasons: [] };
  const noCash = makeDecision(mm, swingBuy(price), price, usdtOnly(0), ind, 'PAXG', position(price, -5));
  assert.doesNotMatch(noCash.recommendation, /Ritmo:/);
  assert.ok(noCash.operations.every(o => o.usdAmount === null));                  // muestra el plan en % (30/30/40)
  const one = makeDecision(mm, swingBuy(price), price, usdtOnly(1000, { installments: 1 }), ind, 'PAXG', position(price, -5));
  assert.doesNotMatch(one.recommendation, /Ritmo:/);
});

// ── p3-3: la cadencia en el motor ────────────────────────────────────────────────────────────────

const CAD_NOW = Date.parse('2026-11-06T15:00:00Z');
const cadBuy = (daysAgo, price = 3923) => ({ date: new Date(CAD_NOW - daysAgo * 86400000).toISOString().slice(0, 10), price, amount_usd: 100 });
const cadPos = (buys = [], extra = {}) => ({
  hasPosition: true, avgBuyPrice: 4774, costBasis: 8231, netInvested: 8231, units: 1.72, portfolioValueUsd: 7000,
  allBuys: buys, executedBuys: buys.filter(b => CAD_NOW - Date.parse(`${b.date}T12:00:00Z`) <= 4 * 86400000), ...extra
});
const cadDecide = (mm, zone, price, pf, over = {}) =>
  makeDecision(mm, swingZones(price, zone), price, usdtOnly(333, over), ind, over.symbol ?? 'PAXG', pf, { now: CAD_NOW });

test('p3-3: la revisión — con la posición bajo el promedio y una compra de hace 3 días, NINGÚN contexto dice COMPRAR', () => {
  const price = 3923;
  const pf = cadPos([cadBuy(3, 3950)]);
  const contexts = [['risk_off', -0.8], ['risk_off', -0.59], ['risk_off', -0.2], ['neutral', 0], ['neutral', 0.2], ['risk_on', 0.4], ['risk_on', 0.8]];
  let waits = 0;
  for (const [mode, score] of contexts) for (const zone of ['buy', 'neutral', 'sell']) {
    const d = cadDecide({ mode, score, reasons: [] }, zone, price, pf);
    assert.equal(d.action, 'WAIT', `${mode} ${score} ${zone}`);
    assert.match(d.reason, /Ya compraste hace 3 días/);
    assert.match(d.recommendation, /una compra por semana/);
    assert.equal(d.cadence.due, false);
    assert.deepEqual(d.operations, []);
    waits++;
  }
  assert.equal(waits, 21);
});

test('p3-3: sin compras registradas toca comprar (primera) y la decisión lo informa', () => {
  const d = cadDecide({ mode: 'risk_off', score: -0.59, reasons: [] }, 'neutral', 3923, cadPos([]));
  assert.equal(d.action, 'BUY');
  assert.equal(d.cadence.reason, 'first');
  assert.equal(d.cadence.due, true);
});

test('p3-3: a los 7 días vuelve a tocar, con el motivo en la recomendación', () => {
  const d = cadDecide({ mode: 'risk_off', score: -0.59, reasons: [] }, 'neutral', 3923, cadPos([cadBuy(8, 3950)]));
  assert.equal(d.action, 'BUY');
  assert.equal(d.cadence.reason, 'due');
  assert.match(d.recommendation, /Toca la compra de la semana/);
});

test('p3-3: una caída de 3 % bajo la última compra adelanta la compra (y el tramo "ahora" es a precio de mercado)', () => {
  const d = cadDecide({ mode: 'risk_off', score: -0.59, reasons: [] }, 'neutral', 3800, cadPos([cadBuy(2, 3950)]));
  assert.equal(d.action, 'BUY');
  assert.equal(d.cadence.reason, 'dip');
  assert.match(d.recommendation, /Toca antes de lo previsto/);
  assert.equal(d.operations[0].price, 3800);
});

test('p3-3: la cadencia aplica a todos los contextos de compra, también BTC', () => {
  const pfBtc = cadPos([cadBuy(2, 86000)], { avgBuyPrice: 90000 });
  const d = cadDecide({ mode: 'risk_on', score: 0.6, reasons: [] }, 'buy', 86000, pfBtc, { symbol: 'BTC' });
  assert.equal(d.action, 'WAIT');
  assert.match(d.reason, /Ya compraste hace 2 días/);
  const due = cadDecide({ mode: 'risk_on', score: 0.6, reasons: [] }, 'buy', 86000, cadPos([cadBuy(9, 86000)], { avgBuyPrice: 90000 }), { symbol: 'BTC' });
  assert.equal(due.action, 'BUY');
});

test('p3-3: la cadencia NO frena las ventas ni el rebalanceo', () => {
  const price = 6000;   // +50 %
  const pf = { hasPosition: true, avgBuyPrice: 4000, costBasis: 4000, netInvested: 4000, units: 1, executedBuys: [cadBuy(0, 6000)], allBuys: [cadBuy(0, 6000)] };
  const d = makeDecision({ mode: 'risk_off', score: -0.5, reasons: [] }, swingZones(price, 'sell'), price, usdtOnly(333), ind, 'PAXG', pf, { now: CAD_NOW });
  assert.equal(d.action, 'SELL');
});

test('p3-3: simulación de 15 días con revisión HORARIA — compra el día 0, 7 y 14 (antes: COMPRAR las 360 horas)', () => {
  const price = 3923, mm = { mode: 'risk_off', score: -0.59, reasons: [] };
  const buys = [];
  const buyHours = [];
  for (let h = 0; h < 15 * 24; h++) {
    const now = CAD_NOW + h * 3600e3;
    const pf = { hasPosition: true, avgBuyPrice: 4774, costBasis: 8231, netInvested: 8231, units: 1.72, portfolioValueUsd: 7000, allBuys: buys, executedBuys: [] };
    const d = makeDecision(mm, swingZones(price, 'neutral'), price, usdtOnly(333), ind, 'PAXG', pf, { now });
    if (d.action === 'BUY') {
      buyHours.push(h);
      buys.push({ date: new Date(now).toISOString().slice(0, 10), price, amount_usd: 100 });     // el usuario compra y lo registra enseguida
    }
  }
  assert.equal(buyHours.length, 3, `compras en las horas ${buyHours}`);
  assert.equal(buyHours[0], 0);
  assert.ok(buyHours[1] >= 6 * 24 && buyHours[1] <= 8 * 24, `la 2.ª a las ${buyHours[1]} h`);
  assert.ok(buyHours[2] - buyHours[1] >= 6 * 24 && buyHours[2] - buyHours[1] <= 8 * 24);
});
