import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';

initializeApp();

const groqApiKey    = defineSecret('GROQ_API_KEY');
const vapidPublic   = defineSecret('VAPID_PUBLIC_KEY');
const vapidPrivate  = defineSecret('VAPID_PRIVATE_KEY');

import app from './src/app.js';

// ── API HTTP ──────────────────────────────────────────────────────────────────
export const api = onRequest(
  {
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 120,
    secrets:        [groqApiKey, vapidPublic, vapidPrivate]
  },
  app
);

// ── Scheduled: chequea zonas cada 1 hora y pushea si cambia a buy ─────────────
export const zoneWatcher = onSchedule(
  {
    schedule:       'every 60 minutes',
    region:         'us-central1',
    timeoutSeconds: 60,
    secrets:        [groqApiKey, vapidPublic, vapidPrivate]
  },
  async () => {
    const { getZoneState, setZoneState, getPushSubscriptions, deletePushSubscription } = await import('./src/config/database.js');
    const { fetchMarketData } = await import('./src/services/marketData.js');
    const { calculateZones }  = await import('./src/services/zoneCalculator.js');
    const { sendPush }        = await import('./src/services/pushService.js');

    const SYMBOLS = ['BTC', 'PAXG'];

    for (const symbol of SYMBOLS) {
      try {
        const market    = await fetchMarketData(symbol);
        const price     = market?.price;
        if (!price) continue;

        const candles   = market?.candles ?? [];
        const zones     = calculateZones(price, candles, symbol);
        const newZone   = zones?.currentZone ?? 'neutral';

        const prev = await getZoneState(symbol);
        await setZoneState(symbol, newZone, price);

        // Solo notificar si cambió A zona de compra (no si sale o si ya estaba)
        if (newZone !== 'buy') continue;
        if (prev?.zone === 'buy') continue;

        const subs = await getPushSubscriptions();
        if (!subs.length) continue;

        const title = `${symbol} — Zona de compra`;
        const body  = `Precio: $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · Oportunidad de acumulación`;

        const validSubs = subs.map(s => s.subscription);
        const kept      = await sendPush(validSubs, title, body, { symbol, zone: newZone });

        // Limpiar suscripciones expiradas
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
);
