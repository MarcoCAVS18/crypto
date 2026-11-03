import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioInsightPrompt, describeCapital } from '../src/services/groqAnalyzer.js';
import { insightCacheKey } from '../src/services/aiHelpers.js';

// El caso real que rompía el prompt: el cliente trabaja en "modo solo USDT" (cashPercent 100, totalCapital = 333 USDT)
// y la posición de PAXG costó ~$8,200. Dividir uno por el otro daba "2400 % invertido · −2300 % libre en cash".
const NOW = Date.parse('2026-11-03T12:00:00Z');
const portfolioCtx = {
  units: 1.7241, avgBuyPrice: 4774, costBasis: 8231, netInvested: 8231, portfolioValueUsd: 7279,
  allBuys: [{ date: '2026-08-20', price: 4700, amount_usd: 800 }, { date: '2026-09-15', price: 4800, amount_usd: 700 }]
};
const decision = {
  action: 'BUY', strength: 'moderado', recommendation: 'Acumulación en tramos.',
  operations: [
    { type: 'BUY', level: 1, usdAmount: 32.4 }, { type: 'BUY', level: 2, usdAmount: 32.4 }, { type: 'BUY', level: 3, usdAmount: 43.2 }
  ]
};
const prompt = (userState, d = decision) => buildPortfolioInsightPrompt({
  asset: 'PAXG', currentPrice: 3923, indicators: { trendShort: 'bajista', rsi: 41.2 }, portfolioCtx, userState, decision: d, recentDecisions: []
}, NOW);

test('modo solo USDT: el capital se describe como EFECTIVO, sin porcentajes absurdos', () => {
  const p = prompt({ cashPercent: 100, totalCapital: 333, mode: 'inversion' });
  assert.match(p, /Efectivo \(USDT\) disponible para comprar: \$333/);
  assert.match(p, /todas sus posiciones valen \$7,279/);
  assert.match(p, /los USDT son el 4\.4 % de su capital total de \$7,612/);
  assert.doesNotMatch(p, /% invertido/);
  assert.doesNotMatch(p, /libre en cash/);
  assert.doesNotMatch(p, /-\d{3,}\.\d %/);                                   // nada de "−2000 %"
});

test('modo solo USDT: se le dice cuánto de los USDT usa la compra y cuánto queda de reserva (para no contradecir al sistema)', () => {
  const p = prompt({ cashPercent: 100, totalCapital: 333 });
  assert.match(p, /esta compra propone usar \$108 \(32 % de los USDT\) y deja \$225 de reserva/);
  assert.match(p, /no digas que hay "poco efectivo"/);
});

test('sin compra propuesta no se inventa un uso de los USDT', () => {
  const p = prompt({ cashPercent: 100, totalCapital: 333 }, { ...decision, action: 'WAIT', operations: [] });
  assert.doesNotMatch(p, /esta compra propone usar/);
  assert.match(p, /Efectivo \(USDT\) disponible para comprar: \$333/);
});

test('esquema viejo (capital total × % de efectivo): se conserva el texto de antes', () => {
  const t = describeCapital({ netInvested: 6000, totalCapital: 20000, cashPercent: 60, portfolioValueUsd: 0, decision, assetValue: 0 });
  assert.equal(t, '$6,000 de $20,000 totales (30.0% invertido · 70.0% libre en cash)');
  assert.equal(describeCapital({ netInvested: 6000, totalCapital: 0, cashPercent: 60, decision, assetValue: 0 }), '$6,000 USD invertidos');
});

test('sin el valor de las posiciones (cliente viejo) igual describe el efectivo sin inventar el total', () => {
  const t = describeCapital({ netInvested: 8231, totalCapital: 333, cashPercent: 100, portfolioValueUsd: NaN, decision: { action: 'WAIT' }, assetValue: 6764 });
  assert.match(t, /^Efectivo \(USDT\) disponible para comprar: \$333 · lo invertido en este activo costó \$8,231 y hoy vale \$6,764$/);
});

test('la clave de caché del insight cambia con los USDT y con lo que la compra propone usar (el texto los nombra)', () => {
  const pf = { avgBuyPrice: 4774, costBasis: 8231 };
  const base = insightCacheKey('PAXG', 3923, pf, 'BUY');
  assert.equal(base, insightCacheKey('PAXG', 3923, pf, 'BUY', {}));          // sin datos de efectivo: igual que antes
  const k = insightCacheKey('PAXG', 3923, pf, 'BUY', { cashUsd: 333, plannedUsd: 108 });
  assert.notEqual(k, base);
  assert.notEqual(k, insightCacheKey('PAXG', 3923, pf, 'BUY', { cashUsd: 500, plannedUsd: 108 }));
  assert.notEqual(k, insightCacheKey('PAXG', 3923, pf, 'BUY', { cashUsd: 333, plannedUsd: 54 }));
  assert.equal(k, insightCacheKey('PAXG', 3923, pf, 'BUY', { cashUsd: 334, plannedUsd: 108.4 }));   // ruido chico no invalida la caché
});
