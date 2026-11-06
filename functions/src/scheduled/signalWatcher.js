// Scheduled function — una vez por hora calcula, para cada usuario con avisos activados, LA MISMA señal que muestra la app
// (services/signalService.js, con sus USDT, su portfolio y su cadencia de compra) y manda un push cuando toca COMPRAR o VENDER.
// Se exporta con el nombre `zoneWatcher` en functions/index.js (se mantiene para no borrar/recrear la función al desplegar).
//
// Antes avisaba solo cuando el precio entraba en "zona de compra" (con un texto fijo): no miraba ni la señal de la app ni al
// usuario, así que los avisos salían todos iguales y no coincidían con lo que decía la pantalla.
//
// Sin ajustes sincronizados (el usuario nunca abrió la app desde que existe la sincronización) o sin USDT cargados no se avisa:
// la app tampoco muestra señal en ese caso.

import { getCryptoData } from '../services/marketData.js';
import { computeSignal } from '../services/signalService.js';
import { buildPortfolioContext } from '../services/portfolioContext.js';
import { engineUserState } from '../services/userSettings.js';
import { nextSignalState, buildNotification } from '../services/signalAlert.js';

const DEFAULT_SYMBOLS = ['BTC', 'PAXG'];
const SYMBOL_RE = /^[A-Z0-9]{2,10}$/;

// Imports dinámicos: database.js y pushService.js cargan firebase-admin / web-push
async function loadDefaultDeps() {
  const db   = await import('../config/database.js');
  const push = await import('../services/pushService.js');
  const gold = await import('../services/goldContext.js');
  const prev = await import('../services/previousMode.js');
  const cal  = await import('../data/macroCalendar.js');
  const aiDeps = await import('../config/aiDeps.js');
  return {
    getCryptoData,
    computeSignal,
    // `ai`: la misma capa de IA que usa la app (decisión vigente compartida por usuario ⇒ el aviso dice lo mismo que la pantalla)
    signalDeps: { getGoldContext: gold.getGoldContext, getPreviousMode: prev.getPreviousMode, getUpcomingEvents: cal.getUpcomingEvents, warn: console.warn, ai: aiDeps.createAiDeps() },
    getProfile: db.getProfile,
    listUserOperations: db.listUserOperations,
    getZoneState: db.getZoneState,
    setZoneState: db.setZoneState,
    getPushSubscriptions: db.getPushSubscriptions,
    deletePushSubscription: db.deletePushSubscription,
    sendPush: push.sendPush,
    now: () => Date.now()
  };
}

/**
 * Punto de entrada del scheduler. onSchedule() invoca al handler con el EVENTO programado como
 * primer argumento, por eso NO se aceptan dependencias acá (usar `run` en tests).
 */
export async function handler() {
  return run(await loadDefaultDeps());
}

/** Suscripciones agrupadas por usuario (las sin usuario se ignoran: ya no se manda un aviso general a todos). */
export function groupByUser(subs = []) {
  const map = new Map();
  for (const s of subs) {
    const id = String(s?.userId ?? '').toLowerCase();
    if (!id || !s?.subscription?.endpoint) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(s.subscription);
  }
  return map;
}

/** @param {object} d - dependencias (reales en producción, falsas en tests) */
export async function run(d) {
  const now = d.now();
  const subs = await d.getPushSubscriptions();
  const byUser = groupByUser(subs);
  const summary = { users: byUser.size, pushes: 0, skipped: [] };
  if (!byUser.size) return summary;

  // Un pedido de mercado por activo en toda la corrida (varios usuarios comparten activos)
  const cache = new Map();
  const market = (symbol) => {
    if (!cache.has(symbol)) {
      cache.set(symbol, Promise.resolve().then(() => d.getCryptoData(symbol)).catch(err => {
        console.warn(`[SignalWatcher] ${symbol}: sin datos de mercado (${err.message})`);
        return null;
      }));
    }
    return cache.get(symbol);
  };

  for (const [userId, userSubs] of byUser) {
    try {
      const profile = await d.getProfile(userId);
      const settings = profile?.settings;
      if (!settings || !(Number(settings.cashUsd) > 0)) { summary.skipped.push(`${userId}: sin USDT sincronizados`); continue; }
      if (settings.mode !== 'inversion') { summary.skipped.push(`${userId}: modo ${settings.mode}`); continue; }

      const userState = engineUserState(settings);
      const symbols = (Array.isArray(profile.cryptos) && profile.cryptos.length ? profile.cryptos : DEFAULT_SYMBOLS)
        .filter(s => SYMBOL_RE.test(s) && s !== 'XAUUSDT');
      const ops = await d.listUserOperations(userId);

      // Precios de todo lo que tiene (para valuar el portfolio y medir pesos) y de lo que sigue
      const prices = {};
      await Promise.all([...new Set([...symbols, ...ops.map(o => o.symbol)])].map(async (s) => {
        const md = await market(s);
        if (md?.price) prices[s] = md.price;
      }));

      for (const symbol of symbols) {
        try {
          const marketData = await market(symbol);
          if (!marketData?.price) continue;
          if (marketData.candlesSource === 'synthetic') { console.warn(`[SignalWatcher] ${symbol}: velas sintéticas, se omite`); continue; }

          const portfolioContext = buildPortfolioContext(ops, symbol, prices, now);
          const { decision } = await d.computeSignal({ symbol, marketData, userState, portfolioContext, now, scope: userId }, d.signalDeps);

          const key = `SIGNAL_${userId}_${symbol}`;
          const { state, push } = nextSignalState(await d.getZoneState(key), decision.action, now);
          await d.setZoneState(key, state);
          if (!push) continue;

          const note = buildNotification(decision, { symbol, price: marketData.price, cashUsd: userState.totalCapital });
          if (!note) continue;

          const kept = await d.sendPush(userSubs, note.title, note.body, note.data);
          const expired = userSubs.filter(s => !kept.some(k => k.endpoint === s.endpoint)).map(s => s.endpoint);
          await Promise.all(expired.map(d.deletePushSubscription));
          summary.pushes += kept.length ? 1 : 0;
          console.log(`[SignalWatcher] ${userId} ${symbol} → ${decision.action} confirmado, push a ${kept.length} dispositivos`);
        } catch (err) {
          console.error(`[SignalWatcher] ${userId} ${symbol} error:`, err.message);
        }
      }
    } catch (err) {
      console.error(`[SignalWatcher] ${userId} error:`, err.message);
    }
  }
  return summary;
}
