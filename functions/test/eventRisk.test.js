import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventCapitalFraction, applyEventRisk, EVENT_RULES } from '../src/services/eventRisk.js';
import { getUpcomingEvents } from '../src/data/macroCalendar.js';

const ev = (o) => ({ name: 'FOMC', fullName: 'Decisión de la Fed (FOMC)', impact: 'critical', phase: 'upcoming', hoursUntil: 10, ...o });
const buy = () => ({
  action: 'BUY', strength: 'fuerte', reason: 'r', recommendation: 'Acumulación progresiva.',
  operations: [{ level: 1, type: 'BUY', price: 4000, usdAmount: 1000, units: 0.25, percentage: 50 }, { level: 2, type: 'BUY', price: 3940, usdAmount: 1000, units: 0.2538, percentage: 50 }]
});

test('sin eventos, o lejanos (>24 h), la decisión no cambia', () => {
  const d = buy();
  assert.equal(applyEventRisk(d, []), d);
  assert.equal(applyEventRisk(d, [ev({ hoursUntil: 30 })]), d);
});

test('evento crítico a ≤ 3 h: pausa la compra (WAIT, sin operaciones) y explica por qué', () => {
  const r = applyEventRisk(buy(), [ev({ hoursUntil: 2 })]);
  assert.equal(r.action, 'WAIT');
  assert.deepEqual(r.operations, []);
  assert.match(r.recommendation, /pausada por evento macro/);
  assert.match(r.recommendation, /en 2 h/);
  assert.equal(r.calendarRisk.capitalFraction, 0);
  assert.equal(r.calendarRisk.deterministic, true);
});

test('crítico publicado hace ≤ 1 h: pausa; hace 3 h: ya no', () => {
  assert.equal(applyEventRisk(buy(), [ev({ phase: 'released', hoursUntil: -0.5 })]).action, 'WAIT');
  const later = buy();
  assert.equal(applyEventRisk(later, [ev({ phase: 'released', hoursUntil: -3 })]), later);
});

test('crítico entre 3 y 24 h: 75 % del tamaño; los montos se reducen y quedan marcados', () => {
  const r = applyEventRisk(buy(), [ev({ hoursUntil: 10 })]);
  assert.equal(r.action, 'BUY');
  assert.equal(r.operations[0].usdAmount, 750);
  assert.ok(Math.abs(r.operations[0].units - 0.1875) < 1e-9);
  assert.ok(r.operations.every(o => o.calendarReduced));
  assert.match(r.recommendation, /al 75%/);
});

test('impacto alto: 50 % a ≤ 2 h y 90 % hasta 24 h; el evento más restrictivo gana', () => {
  assert.equal(eventCapitalFraction([ev({ impact: 'high', hoursUntil: 1 })]).capitalFraction, 0.5);
  assert.equal(eventCapitalFraction([ev({ impact: 'high', hoursUntil: 12 })]).capitalFraction, 0.9);
  const both = eventCapitalFraction([ev({ impact: 'high', hoursUntil: 1 }), ev({ hoursUntil: 2 })]);
  assert.equal(both.capitalFraction, 0);
  assert.equal(both.kind, 'blackout');
});

test('solo modula COMPRAS: SELL y WAIT quedan intactos aunque haya un evento inminente', () => {
  for (const action of ['SELL', 'WAIT']) {
    const d = { ...buy(), action };
    assert.equal(applyEventRisk(d, [ev({ hoursUntil: 1 })]), d);
  }
});

test('es determinístico y no muta la decisión original', () => {
  const d = buy(), snapshot = JSON.stringify(d);
  const a = applyEventRisk(d, [ev({ hoursUntil: 10 })]);
  const b = applyEventRisk(d, [ev({ hoursUntil: 10 })]);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(d), snapshot);
});

test('con el calendario real: alrededor del FOMC del 2026-09-16 (14:00 ET = 18:00 UTC) la compra se pausa solo en la ventana corta', () => {
  const fomc = Date.parse('2026-09-16T18:00:00Z');
  const at = (deltaH) => applyEventRisk(buy(), getUpcomingEvents(2, 'PAXG', fomc + deltaH * 3600e3));
  assert.equal(at(-2).action, 'WAIT');        // 2 h antes
  assert.equal(at(-12).action, 'BUY');        // 12 h antes: solo reduce
  assert.ok(at(-12).operations[0].usdAmount < 1000);
  assert.equal(at(0.5).action, 'WAIT');       // recién publicado
  assert.equal(at(3).action, 'BUY');          // 3 h después: normal
  assert.equal(at(3).operations[0].usdAmount, 1000);
});

test('constantes de la política: ventana corta de pausa, sin recortes amplios', () => {
  assert.ok(EVENT_RULES.critical.blackoutBeforeH <= 3 && EVENT_RULES.critical.blackoutAfterH <= 1);
  assert.ok(EVENT_RULES.critical.nearFraction >= 0.75 && EVENT_RULES.high.nearFraction >= 0.9);
});
