import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
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

// zoneWatcher (scheduled) is defined in src/scheduled/zoneWatcher.js
// To enable: grant roles/cloudscheduler.admin to the deploy service account in GCP IAM,
// then re-add the export here.
