// Limitador de pedidos por IP, en memoria (ventana fija). En Cloud Functions cada instancia tiene su propio
// contador (no se comparte entre instancias): frena ráfagas y abuso simple, NO reemplaza a App Check / autenticación.
// Protege sobre todo lo que cuesta dinero (Groq) o llama a servicios externos.

export function createRateLimiter({ windowMs = 60000, max = 60, now = () => Date.now(), keyOf = clientKey, name = 'default' } = {}) {
  const hits = new Map();          // key → { count, resetAt }

  const limiter = (req, res, next) => {
    const t = now();
    const key = keyOf(req);
    let h = hits.get(key);
    if (!h || h.resetAt <= t) { h = { count: 0, resetAt: t + windowMs }; hits.set(key, h); }
    h.count++;
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - h.count)));
    if (h.count > max) {
      const retry = Math.max(1, Math.ceil((h.resetAt - t) / 1000));
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: `Demasiados pedidos (${name}). Probá de nuevo en ${retry} s.` });
    }
    // limpieza oportunista para que el mapa no crezca sin límite
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    next();
  };
  limiter.reset = () => hits.clear();
  return limiter;
}

/** IP del cliente detrás del proxy de Google (primer valor de X-Forwarded-For). */
export function clientKey(req) {
  const xf = req.headers?.['x-forwarded-for'];
  const ip = (typeof xf === 'string' && xf.split(',')[0].trim()) || req.ip || req.socket?.remoteAddress || 'unknown';
  return ip;
}

/** Límites por ruta: lo caro es lo más estricto. */
export const LIMITS = {
  ai:      { max: 20,  windowMs: 60000, name: 'IA' },          // /api/chat, refrescos de contexto, decisiones (llaman a Groq)
  refresh: { max: 6,   windowMs: 60000, name: 'refresco' },
  probe:   { max: 6,   windowMs: 60000, name: 'diagnóstico' },  // /api/health/ai (llama a Groq)
  general: { max: 240, windowMs: 60000, name: 'general' }
};
