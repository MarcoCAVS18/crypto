import { Router } from 'express';
import Groq from 'groq-sdk';

const router = Router();

const SYSTEM_PROMPT = `Sos un asistente de inversión personal especializado en BTC y PAXG (oro tokenizado).

TEMAS EN LOS QUE PODÉS AYUDAR:
- BTC y PAXG: precios, zonas de compra, DCA, acumulación a largo plazo
- Macro global: Fed, tasas de interés, inflación, dólar, ciclos económicos, en tanto afectan a BTC u oro
- Noticias relevantes que puedan impactar a BTC o al oro (ETF, regulación, geopolítica, halving, etc.)
- Estrategia de inversión: cuándo comprar, cómo distribuir capital, gestión de riesgo básica
- Contexto del portafolio del usuario si se proveen datos

FUERA DE SCOPE (respondé solo: "Solo puedo ayudarte con inversiones en BTC y PAXG."):
- Otras criptomonedas o activos que no sean BTC o PAXG
- Temas sin relación con inversiones (entretenimiento, cocina, etc.)

ESTILO:
- Español rioplatense: "vos", "tenés", "compraste", "invertiste". NUNCA "tú", "tienes", "has comprado".
- Máximo 3 oraciones. Sin introducciones, sin disculpas, sin relleno.
- Usá SOLO los datos de la sección "== DATOS DE X ==" para info del portafolio. NUNCA mezcles datos de BTC con PAXG.
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
  if (ctx.zone)       lines.push(`Zona actual: ${ctx.zone}`);

  if (ctx.portfolio) {
    const p = ctx.portfolio;
    if (p.units > 0) {
      lines.push(`--- Posición del usuario en ${ctx.symbol} (NO en otro activo) ---`);
      lines.push(`  Unidades de ${ctx.symbol}: ${fmt(p.units, 6)}`);
      if (p.netInvested) lines.push(`  Total invertido en ${ctx.symbol}: $${fmt(p.netInvested)}`);
      if (p.avgBuyPrice) lines.push(`  Precio promedio de compra de ${ctx.symbol}: $${fmt(p.avgBuyPrice)}`);
      if (p.currentValue) lines.push(`  Valor actual de la posición en ${ctx.symbol}: $${fmt(p.currentValue)}`);
      if (p.pnlPercent != null) lines.push(`  P&L en ${ctx.symbol}: ${p.pnlPercent > 0 ? '+' : ''}${fmt(p.pnlPercent)}%`);
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

  // Keep only last 6 exchanges (12 messages) for better context
  const trimmedHistory = history.slice(-12);

  const systemContent = SYSTEM_PROMPT + buildContextBlock(context);

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      max_tokens:  200,
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
