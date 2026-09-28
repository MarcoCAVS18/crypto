import { Router } from 'express';
import { chatText } from '../services/groqChat.js';

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

export function buildContextBlock(ctx) {
  if (!ctx) return '';

  const lines = [
    `Activo seleccionado: ${ctx.symbol}`,
    `Precio actual de ${ctx.symbol}: $${fmt(ctx.price)}`
  ];

  if (ctx.marketMode) lines.push(`Modo de mercado: ${ctx.marketMode}${ctx.modeScore != null ? ` (score ${fmt(ctx.modeScore, 2)})` : ''}`);
  if (ctx.decision)   lines.push(`Señal del sistema: ${ctx.decision}${ctx.strength ? ` (${ctx.strength})` : ''}`);
  if (ctx.decisionReason)  lines.push(`Motivo de la señal: ${String(ctx.decisionReason).slice(0, 400)}`);
  if (ctx.recommendation)  lines.push(`Recomendación del sistema: ${String(ctx.recommendation).slice(0, 500)}`);
  if (Array.isArray(ctx.marketReasons) && ctx.marketReasons.length) {
    lines.push('Factores del contexto de mercado:');
    for (const r of ctx.marketReasons.slice(0, 6)) lines.push(`  - ${String(r).slice(0, 200)}`);
  }
  if (ctx.zone)       lines.push(`Zona actual: ${ctx.zone}`);

  if (ctx.portfolio) {
    const p = ctx.portfolio;
    if (p.units > 0) {
      // El frontend manda unidades y promedio; el valor y el P&L se calculan acá
      const price = Number(ctx.price) || 0;
      const currentValue = p.currentValue ?? (price ? p.units * price : null);
      const pnlPercent   = p.pnlPercent   ?? (p.avgBuyPrice > 0 && price ? ((price - p.avgBuyPrice) / p.avgBuyPrice) * 100 : null);
      lines.push(`--- Posición del usuario en ${ctx.symbol} (NO en otro activo) ---`);
      lines.push(`  Unidades de ${ctx.symbol}: ${fmt(p.units, 6)}`);
      const invested = p.costBasis ?? p.netInvested;
      if (invested) lines.push(`  Costo de la posición en ${ctx.symbol}: $${fmt(invested)}`);
      if (p.avgBuyPrice) lines.push(`  Precio promedio de compra de ${ctx.symbol}: $${fmt(p.avgBuyPrice)}`);
      if (currentValue != null) lines.push(`  Valor actual de la posición en ${ctx.symbol}: $${fmt(currentValue)}`);
      if (pnlPercent != null) lines.push(`  P&L en ${ctx.symbol}: ${pnlPercent > 0 ? '+' : ''}${fmt(pnlPercent)}%`);
      if (p.realizedPnl) lines.push(`  Ganancia realizada por ventas: $${fmt(p.realizedPnl)}`);
    }
  }

  return `\n\n== DATOS DE ${ctx.symbol} ==\n${lines.join('\n')}`;
}

/**
 * El historial viene del cliente: solo se aceptan turnos user/assistant con texto.
 * (Un rol "system" enviado por el cliente se inyectaría como instrucción del sistema.)
 */
export function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
}

// POST /api/chat
router.post('/', async (req, res) => {
  const { message, history = [], context } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message requerido' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI no disponible' });

  const systemContent = SYSTEM_PROMPT + buildContextBlock(context);

  try {
    const reply = await chatText({
      temperature: 0.4,
      maxTokens:   300,
      messages: [
        { role: 'system', content: systemContent },
        ...sanitizeHistory(history),
        { role: 'user', content: message.trim().slice(0, 2000) }
      ]
    });
    res.json({ reply });
  } catch (err) {
    console.error('[Chat] error:', err.message);
    res.status(500).json({ error: 'Error procesando tu mensaje' });
  }
});

export default router;
