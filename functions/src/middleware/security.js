// Cabeceras de seguridad básicas y CORS configurable.

export function securityHeaders(_req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Frame-Options', 'DENY');
  next();
}

/**
 * CORS: por defecto refleja el origen (como antes, no rompe nada). Con `CORS_ORIGINS="https://a.web.app,https://b.com"`
 * solo esos orígenes reciben cabeceras CORS (y las llamadas sin Origin, p. ej. el rewrite de Hosting, siguen funcionando).
 */
export function corsOptions(env = process.env) {
  const list = String(env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.length === 0) return { origin: true };
  return { origin: (origin, cb) => cb(null, !origin || list.includes(origin)) };
}
