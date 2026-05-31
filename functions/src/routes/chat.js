import { Router } from 'express';
import Groq from 'groq-sdk';

const router = Router();

const SYSTEM_PROMPT = `Sos un asistente de inversión personal para BTC y PAXG (oro tokenizado). Respondés SOLO sobre inversiones en cripto y oro.

REGLAS:
- Si te preguntan algo ajeno a inversiones, respondés únicamente: "Solo puedo ayudarte con temas de inversión en BTC y PAXG."
- MÁXIMO 2 oraciones. Sin introducciones, sin disculpas, sin relleno.
- Español rioplatense: "vos", "tenés", "compraste", "invertiste". NUNCA "tú", "tienes", "has comprado".
- Usá SOLO los datos de la sección "== DATOS DE X ==" del contexto. Esos datos son EXCLUSIVAMENTE del activo indicado.
- NUNCA atribuyas el precio promedio, unidades o monto invertido de un activo a otro. Si dice "Datos de BTC", son de BTC. Si dice "Datos de PAXG", son de PAXG.
- Foco en acumulación a largo plazo, nunca en tradear.`;

function fmt(n, dec = 2) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: dec });
}

function buildContextBlock(ctx) {
  if (!ctx) return '';

  const lines = [
    `Activo seleccionado: ${ctx.symbol}`,
    `Precio actual de ${ctx.symbol}: $${fmt(ctx.price)}`
  ];

  if (ctx.marketMode) lines.push(`Modo de mercado: ${ctx.marketMode}`);
  if (ctx.decision)   lines.push(`Señal IA: ${ctx.decision}`);
  if (ctx.zone)       lines.push(`Zona: ${ctx.zone}`);

  if (ctx.portfolio) {
    const p = ctx.portfolio;
    if (p.units > 0) {
      lines.push(`--- Posición del usuario en ${ctx.symbol} (NO en otro activo) ---`);
      lines.push(`  Unidades de ${ctx.symbol}: ${fmt(p.units, 6)}`);
      if (p.netInvested) lines.push(`  Total invertido en ${ctx.symbol}: $${fmt(p.netInvested)}`);
      if (p.avgBuyPrice) lines.push(`  Precio promedio de compra de ${ctx.symbol}: $${fmt(p.avgBuyPrice)}`);
    }
  }

  return `\n\n== DATOS DE ${ctx.symbol} ==\n${lines.join('\n')}`;
}

// POST /api/chat
router.post('/', async (req, res) => {
  const { message, history = [], context } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message requerido' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI no disponible' });

  // Keep only last 4 exchanges (8 messages) to minimize tokens
  const trimmedHistory = history.slice(-8);

  const systemContent = SYSTEM_PROMPT + buildContextBlock(context);

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      max_tokens:  140,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemContent },
        ...trimmedHistory,
        { role: 'user', content: message.trim() }
      ]
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? 'Sin respuesta.';
    res.json({ reply });
  } catch (err) {
    console.error('[Chat] error:', err.message);
    res.status(500).json({ error: 'Error procesando tu mensaje' });
  }
});

export default router;
