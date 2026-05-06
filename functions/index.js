import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

// Inicializar Admin SDK (detecta el proyecto automáticamente en producción)
initializeApp();

// Declarar el secreto para que Firebase lo monte en tiempo de ejecución.
// El valor queda disponible como process.env.GROQ_API_KEY en los servicios.
const groqApiKey = defineSecret('GROQ_API_KEY');

// Importar la app Express (después de initializeApp)
import app from './src/app.js';

export const api = onRequest(
  {
    region:         'us-central1',
    memory:         '512MiB',
    timeoutSeconds: 120,
    secrets:        [groqApiKey]
  },
  app
);
