// Scheduled function — revisa las zonas de BTC/PAXG cada hora y avisa (push) cuando el precio
// entra en zona de compra y la zona se CONFIRMA (ver services/zoneAlert.js: 2 lecturas seguidas
// y enfriamiento de 12 h). Exportada como scheduler en functions/index.js.
//
// Antes importaba `fetchMarketData` (inexistente) y llamaba a calculateZones con el símbolo en
// lugar de los indicadores, así que fallaba en cada ejecución y nunca envió un push.

import { getCryptoData } from '../services/marketData.js';
import { calculateAllIndicators } from '../services/technicalAnalysis.js';
import { calculateZones } from '../services/zoneCalculator.js';
import { nextZoneState } from '../services/zoneAlert.js';

const SYMBOLS = ['BTC', 'PAXG'];

// Imports dinámicos: database.js y pushService.js cargan firebase-admin / web-push
async function loadDefaultDeps() {
  const db   = await import('../config/database.js');
  const push = await import('../services/pushService.js');
  return {
    getCryptoData, calculateAllIndicators, calculateZones,
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

/** @param {object} d - dependencias (reales en producción, falsas en tests) */
export async function run(d) {

  for (const symbol of SYMBOLS) {
    try {
      const market = await d.getCryptoData(symbol);
      const price  = market?.price;
      if (!price) continue;
      // Con velas sintéticas las zonas no significan nada: no actualizar estado ni avisar
      if (market.candlesSource === 'synthetic') {
        console.warn(`[ZoneWatcher] ${symbol}: velas sintéticas, se omite`);
        continue;
      }

      const indicators = d.calculateAllIndicators(market.candles);
      const zones      = d.calculateZones(price, market.candles, indicators);
      const newZone    = zones?.currentZone ?? 'neutral';

      const prev = await d.getZoneState(symbol);
      const { state, push } = nextZoneState(prev, newZone, price, d.now());
      await d.setZoneState(symbol, state);

      if (!push) continue;

      const subs = await d.getPushSubscriptions();
      if (!subs.length) continue;

      const title = `${symbol} — Zona de compra`;
      const body  = `Precio: $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · Oportunidad de acumulación`;

      const validSubs = subs.map(s => s.subscription);
      const kept      = await d.sendPush(validSubs, title, body, { symbol, zone: newZone });

      const expiredEndpoints = validSubs
        .filter(s => !kept.some(k => k.endpoint === s.endpoint))
        .map(s => s.endpoint);
      await Promise.all(expiredEndpoints.map(d.deletePushSubscription));

      console.log(`[ZoneWatcher] ${symbol} → buy confirmado, push a ${kept.length} dispositivos`);
    } catch (err) {
      console.error(`[ZoneWatcher] ${symbol} error:`, err.message);
    }
  }
}
