import { Router } from 'express';
import Groq from 'groq-sdk';

const router = Router();

const SYSTEM_PROMPT = `Sos un asistente de inversión personal especializado en BTC y PAXG (oro tokenizado).
Tu función es ayudar al usuario a tomar mejores decisiones de acumulación a largo plazo.

REGLAS ESTRICTAS:
- Solo respondés preguntas sobre BTC, PAXG, oro, cripto y mercados financieros relacionados.
- Si te preguntan algo fuera de ese scope respondés exactamente: "Solo puedo ayudarte con temas de inversión en BTC y PAXG."
- Máximo 3 oraciones por respuesta. Directo al punto, sin rodeos.
- El enfoque es acumular y holdear a largo plazo, nunca tradear.
- Usás el contexto de mercado actual que se te provee para dar respuestas concretas.
- Respondés en español rioplatense (vos, tenés, etc.).`;

function buildContextBlock(ctx) {
  if (!ctx) return '';
  const lines = [];
  if (ctx.symbol && ctx.price) {
    lines.push(`Activo: ${ctx.symbol} | Precio: $${Number(ctx.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  }
  if (ctx.marketMode) lines.push(`Modo de mercado: ${ctx.marketMode}`);
  if (ctx.decision)   lines.push(`Señal IA actual: ${ctx.decision}`);
  if (ctx.zone)       lines.push(`Zona de precio: ${ctx.zone}`);
  if (ctx.portfolio) {
    const p = ctx.portfolio;
    if (p.units > 0 && p.avgBuyPrice) {
      lines.push(`Portfolio ${ctx.symbol}: ${p.units} unidades | Precio promedio: $${Number(p.avgBuyPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
    }
  }
  return lines.length ? `\nCONTEXTO ACTUAL:\n${lines.join('\n')}` : '';
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
      max_tokens:  220,
      temperature: 0.4,
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
