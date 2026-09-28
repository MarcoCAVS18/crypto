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

test('B5: risk_off sin posición o sin zona de venta → WAIT (nunca compra)', () => {
  const price = 4000;
  assert.equal(makeDecision(off, atrZones(price, 'buy'), price, st(60), ind, 'PAXG', null).action, 'WAIT');
  assert.equal(makeDecision(off, atrZones(6000, 'neutral'), 6000, st(60), ind, 'PAXG', position(6000, 50)).action, 'WAIT');
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
