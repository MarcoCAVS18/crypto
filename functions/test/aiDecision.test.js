import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_DECISION, buildAiFacts, buildDecisionPrompt, parseAiDecision, resolveAiDecision, aiFingerprint, decideWithAI
} from '../src/services/aiDecision.js';
import { aiAdjustedFraction, tranchePlan, DCA_POLICY } from '../src/services/dcaPolicy.js';

const DAY = 86400000, HOUR = 3600000;
const NOW = Date.UTC(2026, 10, 6, 12);

const proposal = {
  action: 'BUY',
  operations: [
    { type: 'BUY', usdAmount: 32.4, price: 3923 }, { type: 'BUY', usdAmount: 32.4, price: 3864 }, { type: 'BUY', usdAmount: 43.2, price: 3811 }
  ]
};
const cadence = { due: true, reason: 'due', daysSince: 8, lastBuyPrice: 4150, lastBuyDate: '2026-10-29', nextAt: new Date(NOW - 1 * DAY).toISOString(), days: 7, dipPct: 3 };
const baseInput = (over = {}) => ({
  symbol: 'PAXG', price: 3923, change24hPct: -0.8,
  indicators: { rsi: 41.2, atr: 39, ema: { ema50: 4010, ema200: 3700 }, trendShort: 'bajista', trendLong: 'alcista' },
  zones: { currentZone: 'buy' },
  marketMode: { mode: 'neutral', score: -0.12, reasons: ['Dólar estable (DXY 99.1)', 'Yields moderados (3.9%)'], goldContext: {
    sentiment: 'bearish', sentimentScore: -0.4, reasoning: 'La Fed sorprende con tono restrictivo.', keyFactors: ['Fed', 'Dólar'],
    headlines: [
      { title: 'La Fed insinúa que mantendrá las tasas altas', pubDate: new Date(NOW - 3 * HOUR).toISOString() },
      { title: 'Compras de bancos centrales siguen firmes', pubDate: new Date(NOW - 30 * HOUR).toISOString() }
    ],
    dataHealth: { missing: ['cot'], stale: [] }
  } },
  events: [{ name: 'FOMC', impact: 'critical', phase: 'upcoming', hoursUntil: 20.4 }],
  portfolioContext: { hasPosition: true, avgBuyPrice: 4569, units: 1.2, allBuys: [{ price: 4150, date: '2026-10-29' }, { price: 4700, date: '2026-09-01' }] },
  userState: { totalCapital: 333, cashPercent: 100, installments: 4 },
  proposal, cadence, now: NOW, ...over
});

// ── hechos y prompt ──────────────────────────────────────────────────────────

test('buildAiFacts: resume todo lo que ve el modelo (redondeado, sin objetos grandes)', () => {
  const f = buildAiFacts(baseInput());
  assert.equal(f.symbol, 'PAXG');
  assert.equal(f.price, 3923);
  assert.equal(f.position.pnlPct, -14.1);
  assert.equal(f.position.buysCount, 2);
  assert.equal(f.cash.usd, 333);
  assert.deepEqual(f.cash.rule, { totalUsd: 108, pctOfCash: 32, tranches: [{ usd: 32, price: 3923 }, { usd: 32, price: 3864 }, { usd: 43, price: 3811 }] });
  assert.equal(f.technical.vsEma50Pct, -2.2);
  assert.equal(f.market.dataProblems[0], 'cot');
  assert.deepEqual(f.news.headlines.map(h => h.ageH), [3, 30]);
  assert.equal(f.news.sentiment, 'bearish');                 // PAXG: las noticias salen del contexto de oro
  assert.equal(f.events[0].hoursUntil, 20);
  assert.ok(JSON.stringify(f).length < 4000);
});

test('buildAiFacts: BTC/ETH usan el contexto de noticias que se les pasa; sin noticias queda vacío (no se inventa)', () => {
  const news = { sentiment: 'bullish', score: 0.3, reasoning: 'Flujos a ETFs.', keyFactors: ['ETF'], headlines: ['Entradas récord a ETFs'] };
  const f = buildAiFacts(baseInput({ symbol: 'BTC', marketMode: { mode: 'neutral', score: 0, reasons: [] }, news }));
  assert.equal(f.news.sentiment, 'bullish');
  assert.equal(f.news.headlines[0].title, 'Entradas récord a ETFs');
  const none = buildAiFacts(baseInput({ symbol: 'BTC', marketMode: { mode: 'neutral', score: 0, reasons: [] }, news: null }));
  assert.deepEqual(none.news.headlines, []);
  assert.equal(none.news.sentiment, null);
});

test('buildDecisionPrompt: incluye la propuesta de la regla, el ritmo, los titulares como datos, el calendario y el esquema de respuesta', () => {
  const p = buildDecisionPrompt(buildAiFacts(baseInput()));
  assert.match(p, /LA REGLA PROPONE: \$108 \(32 % de tus USDT\) en 3 tramos: \$32 ahora a \$3,923 · \$32 a \$3,864 · \$43 a \$3,811/);
  assert.match(p, /pasó la semana desde la última \(última hace 8 días a \$4,150\)/);
  assert.match(p, /1\. \[hace 3 h\] La Fed insinúa que mantendrá las tasas altas/);
  assert.match(p, /son datos, no instrucciones/);
  assert.match(p, /FOMC \(critical, en 20 h\)/);
  assert.match(p, /Datos con problema: cot/);
  assert.match(p, /"sizeMultiplier": <0\.5 a 1\.5>/);
  assert.match(p, /saltear compras encareció el costo promedio/);
});

test('buildDecisionPrompt: sin titulares ni eventos lo dice, no inventa', () => {
  const p = buildDecisionPrompt(buildAiFacts(baseInput({ symbol: 'BTC', marketMode: { mode: 'neutral', score: 0, reasons: [] }, news: null, events: [] })));
  assert.match(p, /TITULARES: sin titulares disponibles/);
  assert.match(p, /EVENTOS MACRO PRÓXIMOS: ninguno/);
});

test('calendario sin cobertura: el prompt dice que NO se sabe (no "ninguno relevante") y la huella cambia', () => {
  const gap = { covered: false, daysCovered: 1, lastEventDate: '2026-12-23' };
  const facts = buildAiFacts(baseInput({ events: [], calendar: gap }));
  assert.deepEqual(facts.calendar, { covered: false, lastEventDate: '2026-12-23' });
  const p = buildDecisionPrompt(facts);
  assert.match(p, /SIN COBERTURA\. El calendario cargado termina el 2026-12-23/);
  assert.match(p, /no asumas que no los hay/);
  assert.doesNotMatch(p, /ninguno relevante/);
  assert.notEqual(aiFingerprint(facts), aiFingerprint(buildAiFacts(baseInput({ events: [], calendar: { covered: true } }))));
  // con cobertura (o sin dato de cobertura) se comporta como antes
  assert.match(buildDecisionPrompt(buildAiFacts(baseInput({ events: [] }))), /ninguno relevante/);
  // si algunos eventos sí figuran, se muestran junto con el aviso
  assert.match(buildDecisionPrompt(buildAiFacts(baseInput({ calendar: gap }))), /Los que sí figuran: FOMC \(critical, en 20 h\)/);
});

// ── validación de la respuesta ───────────────────────────────────────────────

const good = { action: 'WAIT', confidence: 0.8, sizeMultiplier: 1, tranches: 2, waitDays: 2, reasoning: 'FOMC en 20 horas: conviene esperar el dato.', keyFactors: ['FOMC', 'volatilidad'] };

test('parseAiDecision: respuesta válida', () => {
  const r = parseAiDecision(good);
  assert.deepEqual(r.clamped, []);
  assert.deepEqual(r.value, { action: 'WAIT', confidence: 0.8, sizeMultiplier: 1, tranches: 2, waitDays: 2, reasoning: good.reasoning, keyFactors: ['FOMC', 'volatilidad'] });
  assert.equal(parseAiDecision({ ...good, action: 'buy', waitDays: undefined }).value.action, 'BUY');
});

test('parseAiDecision: acota los rangos (y lo anota) en vez de confiar en el modelo', () => {
  const r = parseAiDecision({ ...good, action: 'BUY', sizeMultiplier: 9, tranches: 7, confidence: 3 });
  assert.equal(r.value.sizeMultiplier, 1.5);
  assert.equal(r.value.tranches, 3);
  assert.equal(r.value.confidence, 1);
  assert.deepEqual(r.clamped.sort(), ['confidence', 'sizeMultiplier', 'tranches']);
  const low = parseAiDecision({ ...good, action: 'BUY', sizeMultiplier: 0.01, tranches: 0 });
  assert.equal(low.value.sizeMultiplier, 0.5);
  assert.equal(low.value.tranches, 1);
  const w = parseAiDecision({ ...good, waitDays: 40 });
  assert.equal(w.value.waitDays, 5);
  assert.equal(parseAiDecision({ ...good, waitDays: undefined }).value.waitDays, 2);   // esperar sin días ⇒ 2
});

test('parseAiDecision: sin confianza informada no cambia la regla; lo inválido se rechaza', () => {
  assert.equal(parseAiDecision({ ...good, confidence: undefined }).value.confidence, 0);
  for (const bad of [null, 'texto', [], {}, { ...good, action: 'SELL' }, { ...good, action: 'HOLD' }, { ...good, reasoning: '' }, { ...good, reasoning: 'ok' }]) {
    assert.ok(parseAiDecision(bad).error, JSON.stringify(bad));
  }
  const kf = parseAiDecision({ ...good, keyFactors: ['a'.repeat(300), 'b', 'c', 'd', 'e', ''] }).value.keyFactors;
  assert.equal(kf.length, 4);
  assert.equal(kf[0].length, 100);
});

// ── límites duros ────────────────────────────────────────────────────────────

const parsed = (o) => parseAiDecision({ ...good, ...o }).value;

test('esperar con confianza alta: se espera y queda la fecha; con poca confianza se sigue la regla', () => {
  const w = resolveAiDecision({ ai: parsed({ confidence: 0.8, waitDays: 2 }), cadence, now: NOW });
  assert.equal(w.action, 'WAIT');
  assert.equal(w.waitDays, 2);
  assert.equal(w.waitUntil, new Date(NOW + 2 * DAY).toISOString());
  const weak = resolveAiDecision({ ai: parsed({ confidence: 0.4 }), cadence, now: NOW });
  assert.equal(weak.action, 'BUY');
  assert.equal(weak.followedRule, true);
  assert.match(weak.notes[0], /poca confianza \(40 %\)/);
  assert.equal(AI_DECISION.minConfidence, 0.6);
});

test('tope de postergación: pasados 3 días del turno de compra se compra igual', () => {
  const overdue = { ...cadence, nextAt: new Date(NOW - 3.2 * DAY).toISOString() };
  const r = resolveAiDecision({ ai: parsed({ confidence: 0.9 }), cadence: overdue, now: NOW });
  assert.equal(r.action, 'BUY');
  assert.equal(r.capped, true);
  assert.match(r.notes[0], /tope de postergación de 3 días/);
  // también cuenta el tiempo que la IA viene posponiendo (p. ej. primera compra, sin turno de referencia)
  const first = { ...cadence, reason: 'first', nextAt: null };
  assert.equal(resolveAiDecision({ ai: parsed({ confidence: 0.9 }), cadence: first, deferredSince: NOW - 3.1 * DAY, now: NOW }).capped, true);
  assert.equal(resolveAiDecision({ ai: parsed({ confidence: 0.9 }), cadence: first, deferredSince: NOW - 1 * DAY, now: NOW }).action, 'WAIT');
});

test('los días de espera se recortan para no pasar el tope', () => {
  const late = { ...cadence, nextAt: new Date(NOW - 2 * DAY).toISOString() };       // ya van 2 días ⇒ queda 1
  const r = resolveAiDecision({ ai: parsed({ confidence: 0.9, waitDays: 5 }), cadence: late, now: NOW });
  assert.equal(r.action, 'WAIT');
  assert.equal(r.waitDays, 1);
});

test('comprar: tamaño y tramos solo con confianza; sin ajuste real ⇒ la regla tal cual', () => {
  const adj = resolveAiDecision({ ai: parsed({ action: 'BUY', confidence: 0.75, sizeMultiplier: 0.7, tranches: 2 }), cadence, now: NOW });
  assert.deepEqual(adj.sizing, { multiplier: 0.7, tranches: 2 });
  assert.equal(adj.followedRule, false);

  const weak = resolveAiDecision({ ai: parsed({ action: 'BUY', confidence: 0.5, sizeMultiplier: 0.7, tranches: 2 }), cadence, now: NOW });
  assert.equal(weak.sizing, null);
  assert.match(weak.notes[0], /se sigue la regla/);

  const same = resolveAiDecision({ ai: parsed({ action: 'BUY', confidence: 0.9, sizeMultiplier: 1.01, tranches: undefined }), cadence, now: NOW });
  assert.equal(same.sizing, null);
  assert.equal(same.followedRule, true);
});

// ── política: techo del ajuste y tramos ──────────────────────────────────────

test('aiAdjustedFraction: piso ×0.5; techo = máximo estándar (cuota base ×1.5), sin pasarse de lo que ya proponía la regla', () => {
  assert.equal(DCA_POLICY.aiSizing.max, 1.5);
  // regla 0.25 (4 compras, sin tilt): ×0.6 ⇒ 0.15; ×1.5 ⇒ 0.375; pedir ×9 ⇒ igual 0.375
  assert.equal(aiAdjustedFraction(0.25, 0.6, { installments: 4 }).fraction, 0.15);
  assert.equal(aiAdjustedFraction(0.25, 1.5, { installments: 4 }).fraction, 0.375);
  assert.equal(aiAdjustedFraction(0.25, 9, { installments: 4 }).fraction, 0.375);
  assert.equal(aiAdjustedFraction(0.25, 0.01, { installments: 4 }).fraction, 0.125);
  // la regla ya está en el máximo (0.375): la IA no puede subir más, solo bajar
  assert.equal(aiAdjustedFraction(0.375, 1.5, { installments: 4 }).fraction, 0.375);
  assert.equal(aiAdjustedFraction(0.375, 0.5, { installments: 4 }).fraction, 0.1875);
  // la regla propone MÁS que el estándar (peso objetivo ×1.25 con tilt): no se recorta hacia arriba
  assert.equal(aiAdjustedFraction(0.45, 1.2, { installments: 4 }).fraction, 0.45);
  // con 1 compra el techo es todo el efectivo
  assert.equal(aiAdjustedFraction(1, 1.5, { installments: 1 }).fraction, 1);
  // entradas inválidas ⇒ sin cambio
  assert.deepEqual(aiAdjustedFraction(0.25, NaN), { fraction: 0.25, multiplier: 1 });
  assert.deepEqual(aiAdjustedFraction(0, 1.2), { fraction: 0, multiplier: 1 });
});

test('tranchePlan respeta el tope de tramos (1 ⇒ un solo tramo; 2 ⇒ dos si alcanza el mínimo)', () => {
  assert.deepEqual(tranchePlan(108, 1), [1]);
  assert.deepEqual(tranchePlan(108, 2), [0.4, 0.6]);
  assert.deepEqual(tranchePlan(108, 3), [0.3, 0.3, 0.4]);
  assert.deepEqual(tranchePlan(15, 3), [1]);          // el mínimo por orden manda sobre lo que pida la IA
  assert.deepEqual(tranchePlan(0, 1), [1]);
});

// ── huella ───────────────────────────────────────────────────────────────────

test('aiFingerprint: no depende del precio; sí de noticias, eventos, efectivo, promedio y propuesta', () => {
  const base = aiFingerprint(buildAiFacts(baseInput()));
  assert.equal(aiFingerprint(buildAiFacts(baseInput({ price: 3950 }))), base);                      // el precio se controla aparte (banda)
  assert.equal(aiFingerprint(buildAiFacts(baseInput({ now: NOW + 2 * HOUR }))) === base, true);       // pasan horas, mismas noticias
  const f = (o) => aiFingerprint(buildAiFacts(baseInput(o)));
  const mm = baseInput().marketMode;
  assert.notEqual(f({ marketMode: { ...mm, goldContext: { ...mm.goldContext, headlines: [{ title: 'Otra noticia', pubDate: new Date(NOW).toISOString() }] } } }), base);
  assert.notEqual(f({ events: [] }), base);
  assert.notEqual(f({ events: [{ name: 'FOMC', impact: 'critical', phase: 'upcoming', hoursUntil: 2 }] }), base);   // cruzó a "≤ 3 h"
  assert.notEqual(f({ userState: { totalCapital: 600, cashPercent: 100, installments: 4 } }), base);
  assert.notEqual(f({ portfolioContext: { ...baseInput().portfolioContext, avgBuyPrice: 4000 } }), base);
  assert.notEqual(f({ cadence: { ...cadence, reason: 'dip' } }), base);
});

// ── orquestador ──────────────────────────────────────────────────────────────

function makeDeps(over = {}) {
  const store = new Map();
  const calls = { chat: 0, prompts: [], set: 0 };
  const d = {
    model: 'test-model',
    chat: async (prompt) => { calls.chat++; calls.prompts.push(prompt); const r = over.reply ?? good; return typeof r === 'function' ? r(calls.chat) : r; },
    cacheGet: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    cacheSet: async (k, v) => { calls.set++; store.set(k, JSON.stringify(v)); },
    warn: () => {},
    ...over.deps
  };
  return { d, calls, store };
}
const run = (d, o = {}) => decideWithAI({ facts: buildAiFacts(baseInput(o.input)), cadence: o.cadence ?? cadence, scope: o.scope ?? 'marco', now: o.now ?? NOW }, d);

test('decideWithAI: consulta al modelo una vez y reutiliza la decisión mientras nada cambie', async () => {
  const { d, calls } = makeDeps();
  const a = await run(d);
  assert.equal(a.used, true);
  assert.equal(a.cached, false);
  assert.equal(a.final.action, 'WAIT');
  const b = await run(d, { now: NOW + 3 * HOUR });
  assert.equal(b.cached, true);
  assert.equal(calls.chat, 1);
  assert.match(calls.prompts[0], /LA REGLA PROPONE/);
});

test('decideWithAI: vuelve a consultar si el precio se mueve más que la banda, si cambian las noticias o si vence la ventana', async () => {
  const { d, calls } = makeDeps({ reply: { ...good, action: 'BUY' } });
  await run(d);
  await run(d, { input: { price: 3923 * 1.015 } });                       // dentro de la banda de 2 %
  assert.equal(calls.chat, 1);
  await run(d, { input: { price: 3923 * 1.03 } });                        // fuera
  assert.equal(calls.chat, 2);
  const mm = baseInput().marketMode;
  await run(d, { input: { price: 3923 * 1.03, marketMode: { ...mm, goldContext: { ...mm.goldContext, headlines: [{ title: 'Noticia nueva', pubDate: new Date(NOW).toISOString() }] } } } });
  assert.equal(calls.chat, 3);
  await run(d, { input: { price: 3923 * 1.03, marketMode: { ...mm, goldContext: { ...mm.goldContext, headlines: [{ title: 'Noticia nueva', pubDate: new Date(NOW).toISOString() }] } } }, now: NOW + 7 * HOUR });
  assert.equal(calls.chat, 4);                                            // COMPRAR vale 6 h
});

test('decideWithAI: la decisión se comparte por usuario (la app y los avisos de Marco usan la misma) y no entre usuarios', async () => {
  const { d, calls } = makeDeps();
  await run(d, { scope: 'marco' }); await run(d, { scope: 'marco' });
  assert.equal(calls.chat, 1);
  await run(d, { scope: 'tomas' });
  assert.equal(calls.chat, 2);
});

test('decideWithAI: respuesta inválida, error o timeout ⇒ decide la regla; y no se martilla a Groq durante 5 minutos', async () => {
  for (const reply of [{ action: 'SELL', reasoning: 'x'.repeat(30) }, () => { throw new Error('Groq 500'); }, () => { throw new Error('timeout'); }]) {
    const { d, calls } = makeDeps({ reply });
    const r = await run(d);
    assert.equal(r.used, false);
    assert.match(r.message, /decide la regla/);
    const again = await run(d, { now: NOW + 60 * 1000 });
    assert.equal(again.used, false);
    assert.equal(calls.chat, 1, 'no reintenta dentro del backoff');
    await run(d, { now: NOW + 6 * 60 * 1000 });
    assert.equal(calls.chat, 2, 'reintenta pasado el backoff');
  }
});

test('decideWithAI: la caché rota no rompe nada (consulta igual y sigue)', async () => {
  const { d, calls } = makeDeps({ deps: { cacheGet: async () => { throw new Error('firestore'); }, cacheSet: async () => { throw new Error('firestore'); } } });
  const r = await run(d);
  assert.equal(r.used, true);
  assert.equal(calls.chat, 1);
});

test('decideWithAI: posponer varios días seguidos dispara el tope; al registrar una compra (ciclo nuevo) el contador arranca de cero', async () => {
  const { d } = makeDeps({ reply: { ...good, confidence: 0.9, waitDays: 1 } });
  const first = { ...cadence, reason: 'first', nextAt: null, lastBuyDate: undefined };
  const t = (days) => NOW + days * DAY;
  const r0 = await run(d, { cadence: first, now: t(0) });
  assert.equal(r0.final.action, 'WAIT');
  const r1 = await run(d, { cadence: first, now: t(1.5) });          // venció (1 día): vuelve a preguntar y sigue pidiendo esperar
  assert.equal(r1.final.action, 'WAIT');
  const r2 = await run(d, { cadence: first, now: t(3.2) });
  assert.equal(r2.final.action, 'BUY');
  assert.equal(r2.final.capped, true);

  // el usuario compró (nueva lastBuyDate): ciclo nuevo, no se arrastra la postergación anterior
  const next = { ...cadence, reason: 'due', lastBuyDate: '2026-11-09', nextAt: new Date(t(10)).toISOString() };
  const r3 = await run(d, { cadence: next, now: t(10.4), input: { cadence: next } });
  assert.equal(r3.final.action, 'WAIT');
  assert.equal(r3.final.capped, false);
});
