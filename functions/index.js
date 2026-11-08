import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';

initializeApp();

const groqApiKey    = defineSecret('GROQ_API_KEY');
const vapidPublic   = defineSecret('VAPID_PUBLIC_KEY');
const vapidPrivate  = defineSecret('VAPID_PRIVATE_KEY');
const fredApiKey    = defineSecret('FRED_API_KEY');   // series macro de FRED (gratis, ver docs/PAXG_AUDIT.md)

import app from './src/app.js';
import { handler as signalWatcherHandler } from './src/scheduled/signalWatcher.js';
import { handler as snapshotHandler } from './src/scheduled/snapshotJob.js';
import { handler as outcomeHandler } from './src/scheduled/outcomeJob.js';

// ── API HTTP ──────────────────────────────────────────────────────────────────
export const api = onRequest(
  {
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 120,
    secrets:        [groqApiKey, vapidPublic, vapidPrivate, fredApiKey]
  },
  app
);

// ── Scheduled: calcula la señal de cada usuario con avisos y pushea cuando toca comprar/vender ──
// Antes se llamaba `zoneWatcher` (avisaba por zona de precio). Se renombró a propósito: al agregarle los secretos de IA y FRED,
// Cloud Run rechazó actualizar el servicio `zonewatcher` ("Secret environment variable overlaps non secret environment variable:
// GROQ_API_KEY") y eso hacía fallar TODO el deploy (no se publicaba ni el sitio). Con otro nombre se crea limpio y `--force`
// borra el viejo. Calcula la misma señal que la app, por eso necesita el contexto de oro (IA + FRED) además de las claves de push.
export const signalWatcher = onSchedule(
  {
    schedule:       'every 60 minutes',
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 120,
    secrets:        [groqApiKey, fredApiKey, vapidPublic, vapidPrivate]
  },
  signalWatcherHandler
);

// ── Scheduled: snapshot horario de features de mercado (PAXG, BTC) ────────────
// Refresca el contexto de oro si su caché venció, por eso necesita los secretos de IA y FRED.
export const snapshotJob = onSchedule(
  {
    schedule:       'every 60 minutes',
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 120,
    secrets:        [groqApiKey, fredApiKey]
  },
  snapshotHandler
);

// ── Scheduled: etiquetado diario de resultados de las señales (1/5/20/60 días) ─
export const outcomeJob = onSchedule(
  {
    schedule:       'every 24 hours',
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 120
  },
  outcomeHandler
);
