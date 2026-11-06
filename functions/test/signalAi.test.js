import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSignal } from '../src/services/signalService.js';
import { buildPortfolioContext } from '../src/services/portfolioContext.js';
import { buildNotification } from '../src/services/signalAlert.js';
import { buildDecisionRecord } from '../src/services/decisionLog.js';
import { AI_DECISION } from '../src/services/aiDecision.js';
import { DCA_POLICY } from '../src/services/dcaPolicy.js';

// Escenario donde la REGLA propone COMPRAR: BTC en tendencia alcista/neutral, posición comprada hace 10 días a un precio 30 % más caro
// (el ritmo semanal ya venció). Las velas son datos de prueba, no de mercado.
const DAY = 86400000, HOUR = 3600000;
const NOW = Date.UTC(2026, 10, 6, 12);
const candles = Array.from({ length: 300 }, (_, i) => {
  const c = 60000 + i * 120 + Math.sin(i / 3) * 800;
  return { timestamp: NOW - (300 - i) * DAY, open: c * 1.001, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 + (i % 7) * 50 };
});
const marketData = { price: candles.at(-1).close, candles, candlesSource: 'coinbase', change24h: 0.4 };
const user = { cashPercent: 100, mode: 'inversion', totalCapital: 333, installments: 4 };
const portfolio = (daysAgo = 10, priceMult = 1.3) => buildPortfolioContext(
  [{ symbol: 'BTC', type: 'BUY', date: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10), amount_usd: 100, price: marketData.price * priceMult, units: 100 / (marketData.price * priceMult), fee: 0 }],
  'BTC', { BTC: marketData.price }, NOW);
// Con $1000 de efectivo la cuota alcanza para partirla en 2 o 3 tramos aun achicada (con $333 el mínimo por orden manda)
const rich = { ...user, totalCapital: 1000 };

function aiDeps(reply, over = {}) {
  const store = new Map();
  const seen = { chat: 0, prompts: [] };
  const ai = {
    model: 'test-model',
    chat: async (p) => { seen.chat++; seen.prompts.push(p); return typeof reply === 'function' ? reply(seen.chat) : reply; },
    cacheGet: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    cacheSet: async (k, v) => { store.set(k, JSON.stringify(v)); },
    getNews: async () => ({ sentiment: 'bearish', score: -0.5, reasoning: 'Ventas por regulación.', keyFactors: ['Regulación'], headlines: ['El regulador amenaza con nuevas restricciones'] }),
    warn: () => {},
    ...over
  };
  return { deps: { getUpcomingEvents: () => [], warn: () => {}, ai }, seen, store };
}
const signal = (deps, o = {}) => computeSignal({ symbol: 'BTC', marketData, userState: o.user ?? user, portfolioContext: o.pc ?? portfolio(), now: o.now ?? NOW, scope: o.scope ?? 'marco' }, deps);
const buy = { action: 'BUY', confidence: 0.8, sizeMultiplier: 1, reasoning: 'Sin eventos cerca y el precio está bien por debajo de tu promedio.', keyFactors: ['promedio'] };
const total = (d) => (d.operations ?? []).filter(o => o.type === 'BUY').reduce((a, o) => a + o.usdAmount, 0);

test('base: sin capa de IA la regla propone comprar en 3 tramos (el escenario de las pruebas)', async () => {
  const s = await computeSignal({ symbol: 'BTC', marketData, userState: user, portfolioContext: portfolio(), now: NOW }, { getUpcomingEvents: () => [], warn: () => {} });
  assert.equal(s.decision.action, 'BUY');
  assert.equal(s.decision.operations.length, 3);
  assert.equal(s.decision.ai, undefined);
});

test('IA = COMPRAR sin ajuste: queda la propuesta de la regla y se informa que la IA la confirmó', async () => {
  const { deps, seen } = aiDeps(buy);
  const rule = (await computeSignal({ symbol: 'BTC', marketData, userState: user, portfolioContext: portfolio(), now: NOW }, { getUpcomingEvents: () => [], warn: () => {} })).decision;
  const { decision } = await signal(deps);
  assert.equal(decision.action, 'BUY');
  assert.equal(total(decision), total(rule));
  assert.equal(decision.operations.length, rule.operations.length);
  assert.equal(decision.ai.used, true);
  assert.equal(decision.ai.followedRule, true);
  assert.equal(decision.ai.reasoning, buy.reasoning);
  assert.equal(seen.chat, 1);
  // el modelo vio las noticias de BTC, la propuesta de la regla y el efectivo
  assert.match(seen.prompts[0], /El regulador amenaza con nuevas restricciones/);
  assert.match(seen.prompts[0], new RegExp(`LA REGLA PROPONE: \\$${Math.round(total(rule))} `));
  assert.match(seen.prompts[0], /EFECTIVO: \$333/);
});

test('IA ajusta el tamaño y los tramos: el motor rehace las órdenes (costos, mínimos y textos consistentes)', async () => {
  const rule = (await computeSignal({ symbol: 'BTC', marketData, userState: rich, portfolioContext: portfolio(), now: NOW }, { getUpcomingEvents: () => [], warn: () => {} })).decision;
  const { deps } = aiDeps({ ...buy, sizeMultiplier: 0.6, tranches: 2, reasoning: 'Hay incertidumbre regulatoria: entro con menos y en dos tramos.' });
  const { decision } = await signal(deps, { user: rich });
  assert.equal(decision.action, 'BUY');
  assert.equal(decision.operations.length, 2);
  assert.ok(Math.abs(total(decision) - total(rule) * 0.6) < 1, `total ${total(decision)} vs ${total(rule) * 0.6}`);
  assert.equal(decision.ai.followedRule, false);
  assert.deepEqual(decision.ai.applied, { totalUsd: Math.round(total(decision) * 100) / 100, tranches: 2, ruleTotalUsd: Math.round(total(rule) * 100) / 100, ruleTranches: 3 });
  assert.equal(decision.policy.aiMultiplier, 0.6);
  assert.match(decision.recommendation, /Ritmo: tus USDT se reparten/);          // los textos de la regla se recalcularon con el monto nuevo
});

test('IA nunca pasa los límites: pedir ×9 y 7 tramos termina en ×1.5 como máximo y 3 tramos', async () => {
  const rule = (await computeSignal({ symbol: 'BTC', marketData, userState: user, portfolioContext: portfolio(), now: NOW }, { getUpcomingEvents: () => [], warn: () => {} })).decision;
  const { deps } = aiDeps({ ...buy, sizeMultiplier: 9, tranches: 7 });
  const { decision } = await signal(deps);
  const ceiling = 333 * (1 / user.installments) * DCA_POLICY.aiSizing.max;           // cuota base × 1.5
  assert.ok(total(decision) <= ceiling + 0.01, `${total(decision)} ≤ ${ceiling}`);
  assert.ok(total(decision) <= total(rule) * 1.5 + 0.01);
  assert.ok(decision.operations.length <= 3);
  assert.ok(total(decision) <= 333);
  assert.deepEqual(decision.ai.clamped.sort(), ['sizeMultiplier', 'tranches']);
});

test('1 solo tramo: una orden por el total', async () => {
  const { deps } = aiDeps({ ...buy, sizeMultiplier: 1.1, tranches: 1 });
  const { decision } = await signal(deps);
  assert.equal(decision.operations.length, 1);
  assert.equal(decision.operations[0].percentage, 100);
});

test('IA = ESPERAR con confianza: no hay órdenes, queda la fecha y la compra pendiente; el aviso no sale', async () => {
  const { deps } = aiDeps({ action: 'WAIT', confidence: 0.85, waitDays: 2, reasoning: 'El FOMC es mañana y las noticias son adversas: mejor esperar el dato.', keyFactors: ['FOMC'] });
  const { decision } = await signal(deps, { pc: portfolio(8) });                      // el turno venció hace 1 día (< tope de 3)
  assert.equal(decision.action, 'WAIT');
  assert.deepEqual(decision.operations, []);
  assert.match(decision.reason, /^La IA recomienda esperar: El FOMC es mañana/);
  assert.equal(decision.ai.waitDays, 2);
  assert.equal(decision.ai.waitUntil, new Date(NOW + 2 * DAY).toISOString());
  assert.match(decision.recommendation, /La compra queda pendiente hasta el 8 nov/);
  assert.equal(decision.cadence.due, true);                                           // el turno de compra sigue vencido
  assert.equal(buildNotification(decision, { symbol: 'BTC', price: marketData.price, cashUsd: 333 }), null);
});

test('IA = ESPERAR con poca confianza: se sigue la regla (COMPRAR) y se aclara', async () => {
  const { deps } = aiDeps({ action: 'WAIT', confidence: 0.4, waitDays: 3, reasoning: 'Incertidumbre general del mercado en estos días.', keyFactors: [] });
  const { decision } = await signal(deps);
  assert.equal(decision.action, 'BUY');
  assert.match(decision.ai.notes[0], /poca confianza \(40 %\)/);
});

test('tope de postergación: si la IA sigue posponiendo pasados 3 días del turno, se compra igual', async () => {
  const wait = { action: 'WAIT', confidence: 0.9, waitDays: 1, reasoning: 'Prefiero esperar un día más por la volatilidad.', keyFactors: [] };
  const { deps } = aiDeps(wait);
  const pc = portfolio(7.5);                                                          // venció hace medio día
  const d0 = (await signal(deps, { pc, now: NOW })).decision;
  assert.equal(d0.action, 'WAIT');
  const d1 = (await signal(deps, { pc, now: NOW + 1.1 * DAY })).decision;
  assert.equal(d1.action, 'WAIT');
  const d3 = (await signal(deps, { pc, now: NOW + 3.4 * DAY })).decision;
  assert.equal(d3.action, 'BUY');
  assert.equal(d3.ai.capped, true);
  assert.match(d3.ai.notes[0], /tope de postergación/);
});

test('la IA falla o no responde: decide la regla y se informa; no se rompe la señal', async () => {
  const { deps } = aiDeps(() => { throw new Error('Groq 503'); });
  const { decision } = await signal(deps);
  assert.equal(decision.action, 'BUY');
  assert.equal(decision.operations.length, 3);
  assert.equal(decision.ai.used, false);
  assert.match(decision.ai.message, /decide la regla/);
});

test('la IA no se consulta si la regla no propone comprar, si no es modo inversión o si no hay capa configurada', async () => {
  const a = aiDeps(buy);
  await signal(a.deps, { pc: portfolio(1, 1) });                                       // compró ayer al mismo precio ⇒ la regla espera
  await signal(a.deps, { user: { ...user, mode: 'observacion' } });
  await signal(a.deps, { user: { ...user, mode: 'trading' } });
  assert.equal(a.seen.chat, 0);
  const none = await computeSignal({ symbol: 'BTC', marketData, userState: user, portfolioContext: portfolio(), now: NOW }, { getUpcomingEvents: () => [], warn: () => {} });
  assert.equal(none.decision.ai, undefined);
});

test('después de la IA siguen valiendo las reglas deterministas: un FOMC en 1 hora pausa la compra aunque la IA diga COMPRAR', async () => {
  const { deps } = aiDeps(buy);
  deps.getUpcomingEvents = () => [{ name: 'FOMC', fullName: 'Decisión de la Fed', impact: 'critical', phase: 'upcoming', hoursUntil: 1 }];
  const { decision } = await signal(deps);
  assert.equal(decision.action, 'WAIT');
  assert.ok(decision.calendarRisk);
  assert.equal(decision.ai.action, 'BUY');
});

test('la decisión vigente se comparte por usuario: la app y el aviso de Marco no consultan dos veces ni se contradicen', async () => {
  const { deps, seen } = aiDeps(buy);
  const a = await signal(deps, { scope: 'marco', now: NOW });
  const b = await signal(deps, { scope: 'marco', now: NOW + 2 * HOUR });
  assert.equal(seen.chat, 1);
  assert.equal(b.decision.ai.cached, true);
  assert.equal(b.decision.action, a.decision.action);
  await signal(deps, { scope: 'tomas', now: NOW });
  assert.equal(seen.chat, 2);
});

test('el aviso (push) dice lo que decidió la IA cuando ajustó la compra', async () => {
  const { deps } = aiDeps({ ...buy, sizeMultiplier: 0.6, tranches: 2, reasoning: 'Hay incertidumbre regulatoria: entro con menos y en dos tramos.' });
  const { decision } = await signal(deps, { user: rich });
  const n = buildNotification(decision, { symbol: 'BTC', price: marketData.price, cashUsd: 1000 });
  assert.match(n.body, /en 2 tramos/);
  assert.match(n.body, /\nHay incertidumbre regulatoria/);
});

test('el historial guarda lo que propuso la regla y lo que hizo la IA (para medirla después contra los resultados)', async () => {
  const { deps } = aiDeps({ ...buy, sizeMultiplier: 0.6, tranches: 2 });
  const s = await signal(deps, { user: rich });
  const rec = buildDecisionRecord({ symbol: 'BTC', marketData, marketMode: s.marketMode, zones: s.zones, indicators: s.indicators, userState: user, decision: s.decision });
  assert.equal(rec.ai.used, true);
  assert.equal(rec.ai.ruleAction, 'BUY');
  assert.equal(rec.ai.action, 'BUY');
  assert.equal(rec.ai.sizeMultiplier, 0.6);
  assert.equal(rec.ai.appliedTranches, 2);
  assert.ok(rec.ai.ruleTotalUsd > rec.ai.appliedTotalUsd);
  assert.equal(AI_DECISION.version, 'ai1');
  // sin IA: el campo queda nulo (no rompe a Firestore)
  const plain = buildDecisionRecord({ symbol: 'BTC', marketData, marketMode: s.marketMode, zones: s.zones, indicators: s.indicators, userState: user, decision: { action: 'WAIT', operations: [] } });
  assert.equal(plain.ai, null);
});

test('calendario sin cobertura: la señal lo informa, la IA lo sabe y queda registrado en el historial', async () => {
  const { deps, seen } = aiDeps(buy);
  deps.calendarCovers = () => ({ covered: false, daysCovered: 1, lastEventDate: '2026-12-23' });
  const s = await signal(deps);
  assert.deepEqual(s.decision.calendarCoverage, { covered: false, daysCovered: 1, lastEventDate: '2026-12-23' });
  assert.match(seen.prompts[0], /SIN COBERTURA/);
  const rec = buildDecisionRecord({ symbol: 'BTC', marketData, marketMode: s.marketMode, zones: s.zones, indicators: s.indicators, userState: user, decision: s.decision });
  assert.equal(rec.calendarGap, true);

  // con cobertura no aparece nada
  const ok = aiDeps(buy);
  ok.deps.calendarCovers = () => ({ covered: true, daysCovered: 40, lastEventDate: '2027-01-30' });
  const t = await signal(ok.deps);
  assert.equal(t.decision.calendarCoverage, undefined);
  assert.doesNotMatch(ok.seen.prompts[0], /SIN COBERTURA/);
  // y si la dependencia falla, la señal sale igual
  const bad = aiDeps(buy);
  bad.deps.calendarCovers = () => { throw new Error('boom'); };
  assert.equal((await signal(bad.deps)).decision.action, 'BUY');
});

// ── propiedad: ninguna respuesta del modelo (válida, exagerada o basura) saca la señal de los límites ──────────────

test('barrido: con 300 respuestas aleatorias (también basura) y varios USDT/compras, la señal siempre respeta los límites duros', async () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const junk = [null, 'texto', [], {}, { action: 'SELL', reasoning: 'x'.repeat(40) }, { action: 'BUY' }, { action: 'WAIT', confidence: 'alta', reasoning: 'x'.repeat(40) }];
  let buys = 0, waits = 0, fallbacks = 0;

  for (let i = 0; i < 300; i++) {
    const cash = pick([15, 50, 333, 1000, 5000]);
    const installments = pick([1, 2, 4, 12]);
    const u = { ...user, totalCapital: cash, installments };
    const reply = rnd() < 0.15 ? pick(junk) : {
      action: pick(['BUY', 'BUY', 'WAIT']), confidence: pick([0, 0.3, 0.6, 0.9, 1, 5, -1]), sizeMultiplier: pick([0, 0.2, 0.5, 0.8, 1, 1.3, 1.5, 3, 100, -2, 'x']),
      tranches: pick([undefined, 0, 1, 2, 3, 9, 2.6]), waitDays: pick([undefined, 0, 1, 3, 5, 30]),
      reasoning: 'Motivo de prueba suficientemente largo para validar.', keyFactors: ['a']
    };
    const { deps } = aiDeps(reply);
    const pc = portfolio(pick([8, 9, 12]));
    const rule = (await computeSignal({ symbol: 'BTC', marketData, userState: u, portfolioContext: pc, now: NOW }, { getUpcomingEvents: () => [], warn: () => {} })).decision;
    const { decision: d } = await computeSignal({ symbol: 'BTC', marketData, userState: u, portfolioContext: pc, now: NOW, scope: `u${i}` }, deps);

    assert.ok(['BUY', 'WAIT'].includes(d.action), `acción ${d.action}`);
    if (rule.action !== 'BUY') { assert.equal(d.action, rule.action); continue; }          // la IA no fuerza compras
    if (d.action === 'WAIT') {
      waits++;
      assert.deepEqual(d.operations, []);
      assert.ok(d.ai.waitDays >= 1 && d.ai.waitDays <= AI_DECISION.waitDays.max);
      continue;
    }
    buys++;
    if (!d.ai?.used) fallbacks++;
    const t = total(d), r = total(rule);
    const ceiling = Math.max(r, cash * Math.min(1, DCA_POLICY.aiSizing.max / installments));
    assert.ok(t <= cash + 0.01, `${t} ≤ efectivo ${cash}`);
    assert.ok(t <= ceiling + 0.01, `${t} ≤ techo ${ceiling} (regla ${r})`);
    assert.ok(t >= r * DCA_POLICY.aiSizing.min - 0.01, `${t} ≥ piso ${r * 0.5}`);
    assert.ok(d.operations.length >= 1 && d.operations.length <= 3);
    assert.ok(d.operations.every(o => o.usdAmount >= 10 - 1e-9), 'cada orden llega al mínimo');
  }
  assert.ok(buys > 50 && waits > 20 && fallbacks > 10, `cobertura: ${buys} compras, ${waits} esperas, ${fallbacks} con respaldo`);
});
