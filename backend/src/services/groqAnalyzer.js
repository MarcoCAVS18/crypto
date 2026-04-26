// Análisis con Groq (Llama 3.3 70B, free tier ~14,400 req/día)
// 1. analyzeGoldSentiment   — sentimiento macro para oro/PAXG (caché 6h)
// 2. analyzeCalendarRisk    — modulación de decisión por eventos macro (caché 4h)

import Groq from 'groq-sdk';

let groqClient = null;

function getClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY no configurada en las variables de entorno');
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

/**
 * Analiza el sentimiento del mercado de oro con Groq Llama 3.1 70B.
 *
 * @param {string[]} headlines - Titulares de noticias recientes
 * @param {{ dxy, tenYearYield }} macroData - Datos macroeconómicos
 * @returns {{ sentiment, score, reasoning, keyFactors }}
 */
export async function analyzeGoldSentiment(headlines, macroData) {
  const client = getClient();

  const macroLines = [];
  if (macroData?.dxy) {
    const sign = macroData.dxy.changePercent >= 0 ? '+' : '';
    macroLines.push(
      `- DXY (US Dollar Index): ${macroData.dxy.value.toFixed(2)} (${sign}${macroData.dxy.changePercent.toFixed(2)}% hoy)`
    );
  }
  if (macroData?.tenYearYield) {
    const sign = macroData.tenYearYield.changePercent >= 0 ? '+' : '';
    macroLines.push(
      `- Bono EE.UU. 10 años: ${macroData.tenYearYield.value.toFixed(2)}% (${sign}${macroData.tenYearYield.changePercent.toFixed(2)}% hoy)`
    );
  }
  const macroText = macroLines.length > 0
    ? macroLines.join('\n')
    : 'Sin datos macroeconómicos disponibles';

  const headlinesText = headlines.length > 0
    ? headlines.map((h, i) => `${i + 1}. ${typeof h === 'string' ? h : h.title}`).join('\n')
    : 'Sin titulares disponibles';

  const prompt = `Eres un analista especializado en oro físico y PAXG (oro tokenizado).

DATOS MACRO ACTUALES:
${macroText}

TITULARES RECIENTES (inglés):
${headlinesText}

Analiza estos datos y determina el sentimiento para el precio del oro/PAXG en el corto plazo (24-72h).

Responde SOLO con un objeto JSON válido (sin markdown, sin texto extra):
{
  "sentiment": "bullish" | "neutral" | "bearish",
  "score": <número entre -1.0 (muy bajista) y 1.0 (muy alcista)>,
  "reasoning": "<1-2 oraciones en español explicando el análisis>",
  "keyFactors": ["<factor 1 en español>", "<factor 2 en español>", "<factor 3 en español>"]
}`;

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 350
  });

  const content = completion.choices[0]?.message?.content ?? '';

  // Extract JSON — model sometimes wraps it in ```json ... ```
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Groq response did not contain JSON. Raw: ${content.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const validSentiments = ['bullish', 'neutral', 'bearish'];
  return {
    sentiment: validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
    score: typeof parsed.score === 'number' ? Math.max(-1, Math.min(1, parsed.score)) : 0,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.slice(0, 3) : []
  };
}

/**
 * Traduce un array de titulares al español en una sola llamada a Groq.
 * Devuelve los mismos objetos con el campo `title` traducido.
 * Si Groq falla, devuelve los titulares originales sin modificar.
 *
 * @param {Array<{title,url,source,pubDate}>} headlines
 * @returns {Promise<Array<{title,url,source,pubDate}>>}
 */
export async function translateHeadlines(headlines) {
  if (!headlines.length) return headlines;
  const client = getClient();

  const numbered = headlines.map((h, i) => `${i + 1}. ${h.title}`).join('\n');

  const prompt = `Traducí al español rioplatense (Argentina) cada uno de estos titulares financieros.
Mantené nombres propios, siglas (Fed, DXY, CPI, NFP) y cifras tal como están.
Respondé ÚNICAMENTE con un array JSON de strings, en el mismo orden, sin texto extra:
["traducción 1", "traducción 2", ...]

TITULARES:
${numbered}`;

  const completion = await client.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    messages:    [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens:  600
  });

  const content   = completion.choices[0]?.message?.content ?? '';
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error('Translation response has no JSON array');

  const translated = JSON.parse(arrayMatch[0]);
  if (!Array.isArray(translated) || translated.length !== headlines.length) {
    throw new Error('Translation array length mismatch');
  }

  return headlines.map((h, i) => ({
    ...h,
    title: typeof translated[i] === 'string' && translated[i].trim()
      ? translated[i].trim()
      : h.title
  }));
}

/**
 * Evalúa si una señal de inversión debe modularse por eventos macro próximos.
 * Llama razona sobre el contexto completo y devuelve instrucciones concretas.
 *
 * @param {string}   asset          - 'BTC' | 'PAXG'
 * @param {object}   decision       - { action, strength, reason }
 * @param {Array}    upcomingEvents - eventos de macroCalendar dentro de 7 días
 * @param {object}   marketCtx      - { mode, currentZone, rsi, goldSentiment? }
 * @returns {{ modulate, action, strength, capitalFraction, reasoning, calendarNote }}
 */
export async function analyzeCalendarRisk(asset, decision, upcomingEvents, marketCtx = {}) {
  const client = getClient();

  const assetDesc = asset === 'PAXG'
    ? 'PAXG (oro tokenizado — sensible a tasas, dólar e inflación)'
    : 'BTC (Bitcoin — sensible a liquidez global y risk-off)';

  const eventsText = upcomingEvents
    .map(e => `  • ${e.fullName} en ${e.daysUntil} día${e.daysUntil === 1 ? '' : 's'} (impacto: ${e.impact === 'critical' ? 'CRÍTICO' : 'ALTO'})`)
    .join('\n');

  const mktText = [
    marketCtx.mode      && `Modo de mercado: ${marketCtx.mode}`,
    marketCtx.currentZone && `Zona actual: ${marketCtx.currentZone}`,
    marketCtx.rsi != null && `RSI: ${marketCtx.rsi.toFixed(1)}`,
    marketCtx.goldSentiment && `Sentimiento IA sobre oro: ${marketCtx.goldSentiment}`
  ].filter(Boolean).join(' | ');

  const prompt = `Sos un gestor de riesgo especializado en inversiones en criptoactivos y oro tokenizado.

ACTIVO: ${assetDesc}
CONTEXTO DE MERCADO: ${mktText || 'No disponible'}
SEÑAL TÉCNICA DEL SISTEMA: ${decision.action} (intensidad: ${decision.strength})
MOTIVO DE LA SEÑAL: ${decision.reason}

EVENTOS MACRO PRÓXIMOS (EE.UU.) QUE PODRÍAN AFECTAR ESTE ACTIVO:
${eventsText}

Teniendo en cuenta ÚNICAMENTE el riesgo que estos eventos representan para la ejecución de esta señal, respondé SOLO con JSON válido (sin markdown):
{
  "modulate": <true si recomendás cambiar algo, false si la señal está bien tal cual>,
  "action": "${decision.action}",
  "strength": "${decision.strength}",
  "capitalFraction": <1.0 sin cambio, 0.5 para reducir a la mitad, 0.0 para no entrar>,
  "reasoning": "<1 oración en español: por qué sí o por qué no modulás>",
  "calendarNote": "<aviso concreto para el inversor, máx 90 caracteres, en español. Vacío si modulate=false>"
}

Guía de criterio:
- FOMC mañana o hoy → modulate=true, capitalFraction=0.0 (WAIT total) o 0.3 (entrada mínima)
- CPI/NFP en 1-2 días → modulate=true, capitalFraction=0.4-0.6
- Cualquier evento en 3-5 días → modulate=true, capitalFraction=0.6-0.8 si la señal es fuerte
- Eventos en 6-7 días con señal débil → modulate=true, capitalFraction=0.7
- Sin eventos inminentes o señal débil existente → modulate=false`;

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.15,   // baja temperatura: queremos juicio consistente
    max_tokens: 250
  });

  const content = completion.choices[0]?.message?.content ?? '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Calendar risk response has no JSON. Raw: ${content.slice(0, 200)}`);
  }

  const p = JSON.parse(jsonMatch[0]);
  const validActions   = ['BUY', 'WAIT', 'SELL'];
  const validStrengths = ['fuerte', 'moderado', 'débil'];

  return {
    modulate:        p.modulate === true,
    action:          validActions.includes(p.action)    ? p.action    : decision.action,
    strength:        validStrengths.includes(p.strength) ? p.strength  : decision.strength,
    capitalFraction: typeof p.capitalFraction === 'number'
                       ? Math.max(0, Math.min(1, p.capitalFraction))
                       : 1.0,
    reasoning:    typeof p.reasoning    === 'string' ? p.reasoning    : '',
    calendarNote: typeof p.calendarNote === 'string' ? p.calendarNote : ''
  };
}
