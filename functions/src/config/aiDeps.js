// Dependencias reales de la capa de IA de la decisión (services/aiDecision.js): cliente de Groq, caché en Firestore y noticias
// de BTC/ETH. Viven en config/ (como database.js) porque tocan firebase-admin; los servicios reciben esto inyectado.
//
// `AI_DECISION=off` (variable de entorno) apaga la capa sin tocar código: decide solo la regla.
// Sin GROQ_API_KEY la capa sigue "encendida" pero cada consulta falla con un mensaje claro: la pantalla dice que la IA no pudo
// evaluar y que decidió la regla (no se oculta la degradación).

import { chatJson, GROQ_MODEL } from '../services/groqChat.js';
import { getAiCache, setAiCache } from './database.js';
import { getCryptoNewsContext } from '../services/cryptoNewsContext.js';

const NEWS_TIMEOUT_MS = 15000;

export function createAiDeps() {
  if (String(process.env.AI_DECISION ?? '').toLowerCase() === 'off') return undefined;
  return {
    model: GROQ_MODEL,
    // Temperatura 0: la misma información da la misma decisión (además se cachea por huella)
    chat: (prompt) => {
      if (!process.env.GROQ_API_KEY) return Promise.reject(new Error('GROQ_API_KEY no configurada'));
      return chatJson({ prompt, temperature: 0, maxTokens: 600, expect: 'object', label: 'aiDecision' });
    },
    cacheGet: (key) => getAiCache(key),
    cacheSet: (key, value, hours) => setAiCache(key, value, hours),
    // Noticias de BTC/ETH (PAXG trae las suyas dentro del contexto de oro); si tardan, la IA decide sin ellas
    getNews: (symbol) => Promise.race([
      getCryptoNewsContext(symbol),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout de noticias')), NEWS_TIMEOUT_MS))
    ]),
    warn: (m) => console.warn(m)
  };
}
