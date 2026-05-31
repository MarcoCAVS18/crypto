// Scheduled function — checks BTC/PAXG zones every hour, pushes when zone changes TO buy.
// To deploy: add to functions/index.js exports after granting roles/cloudscheduler.admin
// to the deploy service account in GCP IAM.
//
// import { onSchedule } from 'firebase-functions/v2/scheduler';
// import { groqApiKey, vapidPublic, vapidPrivate } from '../config/secrets.js';
//
// export const zoneWatcher = onSchedule(
//   { schedule: 'every 60 minutes', region: 'us-central1', timeoutSeconds: 60,
//     secrets: [groqApiKey, vapidPublic, vapidPrivate] },
//   handler
// );

export async function handler() {
  const { getZoneState, setZoneState, getPushSubscriptions, deletePushSubscription } =
    await import('../config/database.js');
  const { fetchMarketData } = await import('../services/marketData.js');
  const { calculateZones }  = await import('../services/zoneCalculator.js');
  const { sendPush }        = await import('../services/pushService.js');

  const SYMBOLS = ['BTC', 'PAXG'];

  for (const symbol of SYMBOLS) {
    try {
      const market = await fetchMarketData(symbol);
      const price  = market?.price;
      if (!price) continue;

      const candles  = market?.candles ?? [];
      const zones    = calculateZones(price, candles, symbol);
      const newZone  = zones?.currentZone ?? 'neutral';

      const prev = await getZoneState(symbol);
      await setZoneState(symbol, newZone, price);

      if (newZone !== 'buy') continue;
      if (prev?.zone === 'buy') continue;

      const subs = await getPushSubscriptions();
      if (!subs.length) continue;

      const title = `${symbol} — Zona de compra`;
      const body  = `Precio: $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · Oportunidad de acumulación`;

      const validSubs = subs.map(s => s.subscription);
      const kept      = await sendPush(validSubs, title, body, { symbol, zone: newZone });

      const expiredEndpoints = validSubs
        .filter(s => !kept.some(k => k.endpoint === s.endpoint))
        .map(s => s.endpoint);
      await Promise.all(expiredEndpoints.map(deletePushSubscription));

      console.log(`[ZoneWatcher] ${symbol} → buy, pushed to ${kept.length} devices`);
    } catch (err) {
      console.error(`[ZoneWatcher] ${symbol} error:`, err.message);
    }
  }
}
