import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';

initializeApp();

const groqApiKey    = defineSecret('GROQ_API_KEY');
const vapidPublic   = defineSecret('VAPID_PUBLIC_KEY');
const vapidPrivate  = defineSecret('VAPID_PRIVATE_KEY');

import app from './src/app.js';
import { handler as zoneWatcherHandler } from './src/scheduled/zoneWatcher.js';

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
    secrets:        [vapidPublic, vapidPrivate]
  },
  zoneWatcherHandler
);
