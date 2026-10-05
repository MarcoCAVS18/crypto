import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOutcome, baselineReturns, isComplete, HORIZON_DAYS } from '../src/services/outcomes.js';
import { summarizeOutcomes, byStrength, followStats, compareShadow, isHit, signalEpisodes, opMatchesEpisode } from '../src/services/metrics.js';
import { shadowFixedDca } from '../src/services/shadow.js';
import { shouldAlertSourcesDown } from '../src/services/healthAlert.js';

const DAY = 86400000;
const T0 = Date.parse('2026-01-01T00:00:00Z');
// 100 velas diarias: cierre sube 1 por día desde 100; low = close-2, high = close+3
const daily = Array.from({ length: 100 }, (_, i) => ({ timestamp: T0 + i * DAY, close: 100 + i, low: 98 + i, high: 103 + i }));

// ── outcomes ────────────────────────────────────────────────────────────────
test('computeOutcome: retorno, MAE y MFE respecto del precio de la señal, solo de horizontes ya cumplidos', () => {
  const signal = { ts: T0 + 10.5 * DAY, price: 110 };                      // a mitad del día 10
  const now = T0 + 35 * DAY;                                               // hoy: día 35 (20 d ya cumplidos, 60 d no)
  const o = computeOutcome(signal, daily, now);
  // h1: cierre de la vela que termina ≥ ts+1d
  assert.ok(o.h1 && o.h5 && o.h20);
  assert.equal(o.h60, null);                                               // 60 días no transcurrieron
  assert.ok(o.h5.ret > o.h1.ret);                                          // el activo sube
  assert.ok(o.h5.mfe >= o.h5.ret && o.h5.mae <= o.h5.ret);                 // MFE ≥ retorno ≥ MAE (coherencia)
  assert.equal(isComplete(o), false);
});

test('computeOutcome: no usa velas sin cerrar ni anteriores a la señal; entradas inválidas ⇒ todo null', () => {
  const o = computeOutcome({ ts: T0 + 5 * DAY, price: 105 }, daily, T0 + 5.5 * DAY);   // ni un día completo después
  assert.deepEqual(Object.values(o), [null, null, null, null]);
  for (const bad of [null, { ts: NaN, price: 1 }, { ts: 1, price: 0 }]) assert.ok(Object.values(computeOutcome(bad, daily)).every(v => v === null));
  assert.ok(Object.values(computeOutcome({ ts: 1, price: 1 }, undefined)).every(v => v === null));
});

test('computeOutcome: señal vieja ⇒ los 4 horizontes completos', () => {
  const o = computeOutcome({ ts: T0 + 2 * DAY, price: 102 }, daily, T0 + 99 * DAY);
  assert.equal(isComplete(o), true);
  assert.deepEqual(HORIZON_DAYS, [1, 5, 20, 60]);
});

test('baselineReturns: media y tasa de subidas de todas las ventanas; pocos datos ⇒ null', () => {
  const b = baselineReturns(daily, 20);
  assert.ok(b.meanRet > 0 && b.upRate === 1);
  assert.equal(baselineReturns(daily.slice(0, 15), 20), null);
});

// ── metrics ─────────────────────────────────────────────────────────────────
const rec = (action, ret20, extra = {}) => ({ action, strength: 'moderado', ts: T0, h20: { ret: ret20, mae: ret20 - 0.02, mfe: ret20 + 0.02 }, ...extra });

test('isHit: BUY acierta si sube, SELL si baja, WAIT sin veredicto', () => {
  assert.equal(isHit('BUY', 0.01), true); assert.equal(isHit('BUY', -0.01), false);
  assert.equal(isHit('SELL', -0.01), true); assert.equal(isHit('WAIT', 0.5), null);
});

test('summarizeOutcomes: hit rate, retorno medio y ventaja contra la línea base', () => {
  const records = [rec('BUY', 0.03), rec('BUY', -0.01), rec('BUY', 0.05), rec('SELL', -0.02), rec('WAIT', 0.01)];
  const s = summarizeOutcomes(records, { 20: { meanRet: 0.01, upRate: 0.6 } });
  assert.equal(s.BUY[20].n, 3);
  assert.equal(s.BUY[20].hitRate, 0.6667);
  assert.equal(s.BUY[20].meanRet, 0.0233);
  assert.equal(s.BUY[20].edgeVsBase, 0.0133);              // 2.33 % − 1 %
  assert.equal(s.SELL[20].hitRate, 1);
  assert.equal(s.SELL[20].edgeVsBase, 0.03);               // vender antes de una caída vs base +1 %
  assert.equal(s.WAIT[20].hitRate, null);
  assert.equal(s.BUY[1].n, 0);                              // sin datos ⇒ n 0, sin inventar
});

test('byStrength: separa fuerte/moderado/débil', () => {
  const r = byStrength([rec('BUY', 0.04, { strength: 'fuerte' }), rec('BUY', -0.02, { strength: 'débil' }), rec('BUY', 0.02, { strength: 'débil' })], 20);
  assert.equal(r.fuerte.n, 1); assert.equal(r['débil'].n, 2); assert.equal(r.moderado.n, 0);
  assert.equal(r['débil'].hitRate, 0.5);
});

// Las operaciones se guardan con fecha (sin hora): getOperationsForSymbol les pone 12:00 UTC
const noon = (iso) => Date.parse(`${iso}T12:00:00Z`);
const sig = (action, iso, h20 = null) => ({ action, ts: Date.parse(iso), h20: h20 === null ? null : { ret: h20 } });

test('seguimiento: una operación del MISMO DÍA que sale después del aviso de la tarde cuenta como seguida (antes no)', () => {
  // aviso de compra a las 21:00 UTC; la operación del día figura a las 12:00 UTC (anterior al aviso, pero es el mismo día)
  const f = followStats([sig('BUY', '2026-10-02T21:00:00Z')], [{ type: 'BUY', ts: noon('2026-10-02') }]);
  assert.equal(f.signals, 1); assert.equal(f.followed, 1); assert.equal(f.followRate, 1);
});

test('seguimiento: los avisos horarios repetidos son UNA señal (no cientos) y se sigue con una sola operación', () => {
  const hourly = Array.from({ length: 30 }, (_, i) => sig('BUY', new Date(Date.parse('2026-10-01T10:00:00Z') + i * 3600e3).toISOString()));   // 30 h seguidas
  assert.equal(signalEpisodes(hourly).length, 1);
  const f = followStats(hourly, [{ type: 'BUY', ts: noon('2026-10-02') }]);
  assert.equal(f.signals, 1); assert.equal(f.followRate, 1);
});

test('seguimiento: señales separadas (> 12 h) son distintas, y cada tipo va por separado', () => {
  const recs = [sig('BUY', '2026-10-01T10:00:00Z'), sig('BUY', '2026-10-04T10:00:00Z'), sig('SELL', '2026-10-04T11:00:00Z'), sig('WAIT', '2026-10-05T10:00:00Z')];
  const eps = signalEpisodes(recs);
  assert.deepEqual(eps.map(e => e.action), ['BUY', 'BUY', 'SELL']);   // WAIT no es señal
});

test('seguimiento: tipo equivocado o fuera de ventana no cuenta; ventana = día de la señal y el siguiente', () => {
  const ep = { action: 'BUY', start: Date.parse('2026-10-02T15:00:00Z'), end: Date.parse('2026-10-02T15:00:00Z') };
  assert.equal(opMatchesEpisode({ type: 'BUY', ts: noon('2026-10-02') }, ep), true);
  assert.equal(opMatchesEpisode({ type: 'BUY', ts: noon('2026-10-03') }, ep), true);
  assert.equal(opMatchesEpisode({ type: 'BUY', ts: noon('2026-10-04') }, ep), false);   // dos días después
  assert.equal(opMatchesEpisode({ type: 'BUY', ts: noon('2026-10-01') }, ep), false);   // el día anterior (aviso de la tarde)
  assert.equal(opMatchesEpisode({ type: 'SELL', ts: noon('2026-10-02') }, ep), false);
  // aviso de madrugada UTC (noche en América): vale también la operación del día anterior
  const early = { action: 'BUY', start: Date.parse('2026-10-03T02:00:00Z'), end: Date.parse('2026-10-03T02:00:00Z') };
  assert.equal(opMatchesEpisode({ type: 'BUY', ts: noon('2026-10-02') }, early), true);
});

test('followStats: tasa, operaciones sin señal y resultado medio a 20 d de seguidas vs no seguidas', () => {
  const recs = [sig('BUY', '2026-09-01T10:00:00Z', 0.05), sig('BUY', '2026-09-10T10:00:00Z', -0.03), sig('SELL', '2026-09-20T10:00:00Z')];
  const ops = [{ type: 'BUY', ts: noon('2026-09-01') }, { type: 'BUY', ts: noon('2026-09-25') }, { type: 'SELL', ts: noon('2026-09-21') }];
  const f = followStats(recs, ops);
  assert.equal(f.signals, 3); assert.equal(f.followed, 2); assert.equal(f.followRate, 0.6667);
  assert.equal(f.operations, 3); assert.equal(f.operationsWithoutSignal, 1);    // la compra del 25-sep no tuvo señal
  assert.equal(f.meanRetFollowed, 0.05); assert.equal(f.meanRetNotFollowed, -0.03);
  assert.equal(f.recent.length, 3); assert.equal(f.recent[0].action, 'SELL');
});

test('followStats: sin señales o sin operaciones no inventa tasas', () => {
  assert.equal(followStats([], [{ type: 'BUY', ts: 1 }]).followRate, null);
  const f = followStats([sig('BUY', '2026-10-02T10:00:00Z')], []);
  assert.equal(f.followed, 0); assert.equal(f.followRate, 0); assert.equal(f.operations, 0);
});

test('compareShadow: campeón vs DCA fijo', () => {
  const rs = [rec('BUY', 0.04, { shadow: { id: 'fixed_dca', action: 'BUY' } }), rec('WAIT', -0.02, { shadow: { id: 'fixed_dca', action: 'BUY' } }), rec('BUY', 0.02, { shadow: { id: 'fixed_dca', action: 'BUY' } })];
  const c = compareShadow(rs, 20);
  assert.equal(c.champion.buys, 2); assert.equal(c.shadow.buys, 3);
  assert.equal(c.champion.meanRet, 0.03); assert.equal(c.shadow.meanRet, 0.0133);
});

// ── sombra y alertas ────────────────────────────────────────────────────────
test('shadowFixedDca: compra fija en inversión con efectivo; no en observación ni con poco efectivo', () => {
  assert.equal(shadowFixedDca({ mode: 'inversion', cashPercent: 50 }).action, 'BUY');
  assert.equal(shadowFixedDca({ mode: 'inversion', cashPercent: 20 }).action, 'WAIT');
  assert.equal(shadowFixedDca({ mode: 'observacion', cashPercent: 90 }).action, 'WAIT');
});

test('alerta de fuentes: solo con severa persistente (3 ciclos) y respetando el enfriamiento de 12 h', () => {
  const sev = { dataHealth: { level: 'severe' } }, ok = { dataHealth: { level: 'none' } };
  const now = 1e12;
  assert.equal(shouldAlertSourcesDown({ currentLevel: 'partial', previousSnapshots: [sev, sev], now }).alert, false);
  assert.equal(shouldAlertSourcesDown({ currentLevel: 'severe', previousSnapshots: [sev], now }).alert, false);
  assert.equal(shouldAlertSourcesDown({ currentLevel: 'severe', previousSnapshots: [sev, ok], now }).alert, false);
  assert.equal(shouldAlertSourcesDown({ currentLevel: 'severe', previousSnapshots: [sev, sev], now }).alert, true);
  assert.equal(shouldAlertSourcesDown({ currentLevel: 'severe', previousSnapshots: [sev, sev], lastAlertAt: now - 3600e3, now }).reason, 'cooldown');
  assert.equal(shouldAlertSourcesDown({ currentLevel: 'severe', previousSnapshots: [sev, sev], lastAlertAt: now - 13 * 3600e3, now }).alert, true);
});
