// Cliente único de Groq: modelo configurable, presupuesto de tokens para modelos de
// razonamiento, reintento ante respuestas vacías/cortadas y extracción tolerante de JSON.
//
// Por qué existe: `openai/gpt-oss-*` es un modelo de RAZONAMIENTO. Sus tokens de razonamiento
// cuentan contra `max_tokens`, así que con presupuestos de 200–600 la respuesta puede llegar
// vacía o cortada ("Sin respuesta", "no contiene JSON"). Acá se baja el esfuerzo de razonamiento
// (`reasoning_effort: 'low'`, parámetro documentado por Groq para gpt-oss) y se suma un colchón.
//
// El nombre del modelo sale de GROQ_MODEL (por defecto openai/gpt-oss-120b) para poder cambiarlo
// sin redeploy de código cuando Groq depreque uno.

import Groq from 'groq-sdk';

export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

// Colchón de tokens sobre el presupuesto visible, para el razonamiento interno
export const REASONING_HEADROOM = 1024;

let groqClient = null;
let groqClientKey = null;

/**
 * Limpia la clave tal como suele llegar de un secreto pegado a mano: espacios, saltos de línea, comillas,
 * prefijo "Bearer " o "GROQ_API_KEY=". Una clave válida con un "\n" al final produce exactamente
 * "401 Invalid API Key".
 */
export function normalizeApiKey(raw) {
  if (typeof raw !== 'string') return '';
  let k = raw.trim().replace(/^GROQ_API_KEY\s*=\s*/i, '').replace(/^bearer\s+/i, '').trim();
  k = k.replace(/^["'`]+|["'`]+$/g, '').trim();
  return k.replace(/\s+/g, '');
}

/** Qué tipo de clave parece ser (para detectar un secreto pisado por otra clave). */
export function guessKeyKind(k) {
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (/^[a-f0-9]{32}$/i.test(k)) return 'fred (32 caracteres hexadecimales)';
  if (/^sk-/.test(k)) return 'openai/otro proveedor';
  return 'desconocida';
}

/** Huella no reversible para diagnosticar SIN exponer la clave: formato, largo y últimos 4 caracteres. */
export function describeApiKey(raw) {
  const k = normalizeApiKey(raw);
  if (!k) return { present: false };
  return {
    present: true,
    looksLike: guessKeyKind(k),
    format: k.startsWith('gsk_') ? 'gsk_…' : 'inesperado (las claves de Groq empiezan con gsk_)',
    length: k.length,
    last4: k.slice(-4),
    hadExtraWhitespaceOrQuotes: k !== raw
  };
}

/** El cliente se recrea si el secreto cambió: una instancia caliente no debe quedarse con una clave vieja. */
export function getGroqClient() {
  const apiKey = normalizeApiKey(process.env.GROQ_API_KEY);
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada en las variables de entorno');
  if (!groqClient || groqClientKey !== apiKey) {
    groqClient = new Groq({ apiKey });
    groqClientKey = apiKey;
  }
  return groqClient;
}

/** Traduce el 401 de Groq a una causa accionable. */
export function explainGroqError(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 401 || /invalid_api_key|Invalid API Key/i.test(err?.message ?? '')) {
    const d = describeApiKey(process.env.GROQ_API_KEY);
    return new Error(
      `Groq rechazó la API key (401). La función tiene ${d.present ? `una clave ${d.format} de ${d.length} caracteres terminada en …${d.last4} (parece de: ${d.looksLike})` : 'NINGUNA clave'}. ` +
      'Verificá que sea la vigente en console.groq.com/keys y que el secreto GROQ_API_KEY se haya cargado sin espacios ni comillas; ' +
      'después hay que volver a desplegar las funciones (los secretos se leen al iniciar la instancia).'
    );
  }
  return err;
}

export const isReasoningModel = (model) => /gpt-oss/i.test(model);

/** Parámetros de la request. `maxTokens` es el presupuesto de la RESPUESTA visible. */
export function buildParams({ model = GROQ_MODEL, messages, temperature, maxTokens, budgetMultiplier = 1 }) {
  const reasoning = isReasoningModel(model);
  const visible = Math.round(maxTokens * budgetMultiplier);
  return {
    model,
    messages,
    temperature,
    max_tokens: reasoning ? visible + REASONING_HEADROOM * budgetMultiplier : visible,
    ...(reasoning ? { reasoning_effort: 'low' } : {})
  };
}

/**
 * Extrae el primer objeto/array JSON de un texto (tolera ```json ... ``` y texto alrededor).
 * @param {'object'|'array'} expect
 */
export function extractJson(raw, expect = 'object') {
  const text = String(raw ?? '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = expect === 'array' ? text.match(/\[[\s\S]*\]/) : text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`la respuesta no contiene un ${expect === 'array' ? 'array' : 'objeto'} JSON. Raw: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

async function callOnce(client, params) {
  let completion;
  try {
    completion = await client.chat.completions.create(params);
  } catch (err) {
    throw explainGroqError(err);
  }
  const choice = completion.choices?.[0];
  return {
    content: choice?.message?.content ?? '',
    finishReason: choice?.finish_reason ?? null,
    usage: completion.usage ?? null
  };
}

/**
 * Texto libre (chat). Si llega vacío porque el razonamiento se comió el presupuesto
 * (finish_reason 'length'), reintenta una vez con el doble.
 */
export async function chatText({ messages, temperature = 0.4, maxTokens = 300, client, model = GROQ_MODEL }) {
  const c = client ?? getGroqClient();
  for (let attempt = 0; attempt < 2; attempt++) {
    const params = buildParams({ model, messages, temperature, maxTokens, budgetMultiplier: attempt === 0 ? 1 : 2 });
    const r = await callOnce(c, params);
    if (r.content.trim()) return r.content.trim();
    if (r.finishReason !== 'length') break;
  }
  throw new Error('Groq devolvió una respuesta vacía');
}

/**
 * Pide JSON. Reintenta una vez con el doble de presupuesto si la respuesta llegó vacía o
 * cortada por longitud (JSON incompleto).
 * @param {object} o
 * @param {string} o.prompt
 * @param {'object'|'array'} [o.expect]
 * @param {string} [o.label] - para mensajes de error
 */
export async function chatJson({ prompt, temperature = 0.2, maxTokens = 400, expect = 'object', label = 'groq', client, model = GROQ_MODEL }) {
  const c = client ?? getGroqClient();
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const params = buildParams({
      model, messages: [{ role: 'user', content: prompt }], temperature, maxTokens,
      budgetMultiplier: attempt === 0 ? 1 : 2
    });
    const r = await callOnce(c, params);

    if (!r.content.trim()) {
      lastError = new Error(`${label}: respuesta vacía (finish_reason=${r.finishReason})`);
      if (r.finishReason === 'length') continue;    // se quedó sin presupuesto: reintentar con más
      throw lastError;
    }
    try {
      return extractJson(r.content, expect);
    } catch (err) {
      lastError = new Error(`${label}: ${err.message}`);
      if (r.finishReason === 'length') continue;    // JSON cortado
      throw lastError;
    }
  }
  throw lastError ?? new Error(`${label}: sin respuesta`);
}

/**
 * Prueba la clave contra Groq SIN gastar tokens (lista de modelos) y dice qué pasa y qué hacer.
 * @returns {Promise<{ ok:boolean, status:number|null, keyInfo:object, modelAvailable:boolean|null, hint:string }>}
 */
export async function probeGroqKey({ apiKey = process.env.GROQ_API_KEY, model = GROQ_MODEL, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const keyInfo = describeApiKey(apiKey);
  if (!keyInfo.present) return { ok: false, status: null, keyInfo, modelAvailable: null, hint: 'No hay GROQ_API_KEY en la función: cargá el secreto y volvé a desplegar.' };
  try {
    const res = await fetchImpl('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${normalizeApiKey(apiKey)}` },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (res.status === 401) {
      const wrong = keyInfo.looksLike !== 'groq';
      return { ok: false, status: 401, keyInfo, modelAvailable: null,
        hint: wrong
          ? `Groq no reconoce la clave y además no parece una clave de Groq (parece: ${keyInfo.looksLike}). Probablemente el secreto GROQ_API_KEY fue reemplazado por otra clave: volvé a cargarlo con la de console.groq.com/keys y redesplegá.`
          : 'Groq no reconoce esta clave (tiene formato gsk_…): está revocada, vencida o pertenece a otra cuenta. Generá una nueva en console.groq.com/keys, cargala como secreto GROQ_API_KEY y redesplegá.' };
    }
    if (!res.ok) return { ok: false, status: res.status, keyInfo, modelAvailable: null, hint: `Groq respondió HTTP ${res.status}.` };
    const ids = ((await res.json())?.data ?? []).map(m => m.id);
    const modelAvailable = ids.includes(model);
    return { ok: true, status: 200, keyInfo, modelAvailable,
      hint: modelAvailable ? 'La clave funciona y el modelo configurado está disponible.' : `La clave funciona pero el modelo "${model}" no aparece disponible para tu cuenta: cambiá GROQ_MODEL (disponibles: ${ids.slice(0, 8).join(', ')}).` };
  } catch (err) {
    return { ok: false, status: null, keyInfo, modelAvailable: null, hint: `No se pudo contactar a Groq: ${err.message}` };
  }
}
