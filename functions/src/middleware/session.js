// Exige una sesión válida (Authorization: Bearer <token>). Deja el usuario en req.userId.
import { sessionId, sessionValid } from '../services/pinAuth.js';
import { getSession, deleteSession } from '../config/database.js';

export function tokenFrom(req) {
  const h = req.headers?.authorization ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

export function createRequireSession({ lookup = getSession, remove = deleteSession, now = () => Date.now() } = {}) {
  return async function requireSession(req, res, next) {
    const token = tokenFrom(req);
    if (!token) return res.status(401).json({ error: 'Iniciá sesión con tu PIN.', code: 'SESSION' });
    try {
      const s = await lookup(sessionId(token));
      if (s && !sessionValid(s, now())) remove(sessionId(token)).catch(() => {});      // limpieza de sesiones vencidas
      if (!sessionValid(s, now())) return res.status(401).json({ error: 'Tu sesión venció. Ingresá tu PIN de nuevo.', code: 'SESSION' });
      req.userId = s.userId;
      req.sessionId = sessionId(token);
      next();
    } catch (err) {
      console.error('[Session] error:', err.message);
      res.status(500).json({ error: 'No se pudo verificar la sesión.' });
    }
  };
}
export const requireSession = createRequireSession();
