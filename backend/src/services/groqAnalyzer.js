// Análisis de sentimiento para oro usando Groq (Llama 3.1 70B, free tier)
// Free tier: ~14,400 req/día — más que suficiente con caché de 6h

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
    ? headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
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
