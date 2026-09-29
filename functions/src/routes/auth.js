// Autenticación por PIN (servidor). El navegador ya no lee ni escribe user_profiles.
import express from 'express';
import { isKnownProfile } from '../config/profiles.js';
import {
  PIN_RE, makeCredential, checkPin, lockState, afterAttempt, attemptsLeft, newSession, MAX_FAILS
} from '../services/pinAuth.js';
import { getProfile, createProfile, updateProfile, saveSession, deleteSession } from '../config/database.js';
import { requireSession } from '../middleware/session.js';

const router = express.Router();
const COIN_RE = /^[A-Z0-9]{2,10}$/;

const startSession = async (userId) => {
  const s = newSession();
  await saveSession(s.id, { userId, createdAt: s.createdAt, expiresAt: s.expiresAt });
  return { token: s.token, expiresAt: s.expiresAt };
};

// ¿El perfil ya tiene PIN? (define si la pantalla pide crearlo o verificarlo)
router.get('/status/:userId', async (req, res) => {
  const userId = String(req.params.userId ?? '').toLowerCase();
  if (!isKnownProfile(userId)) return res.status(404).json({ error: 'Perfil desconocido' });
  try {
    const p = await getProfile(userId);
    res.json({ userId, exists: !!p?.pinHash });
  } catch (err) {
    console.error('[Auth] status:', err.message);
    res.status(500).json({ error: 'No se pudo consultar el perfil.' });
  }
});

// Crea el PIN de un perfil que todavía no lo tiene (nunca pisa uno existente)
router.post('/setup', async (req, res) => {
  const userId = String(req.body?.userId ?? '').toLowerCase();
  const pin = String(req.body?.pin ?? '');
  if (!isKnownProfile(userId)) return res.status(404).json({ error: 'Perfil desconocido' });
  if (!PIN_RE.test(pin)) return res.status(400).json({ error: 'El PIN debe tener entre 4 y 8 dígitos.' });
  try {
    const existing = await getProfile(userId);
    if (existing?.pinHash) return res.status(409).json({ error: 'Este perfil ya tiene PIN.' });
    // Un perfil creado antes solo con `cryptos` (sin PIN) se completa; uno nuevo se crea sin pisar nada
    if (existing) await updateProfile(userId, { ...makeCredential(pin), failCount: 0, lockedUntil: 0 });
    else if (!(await createProfile(userId, { ...makeCredential(pin), failCount: 0, lockedUntil: 0 }))) {
      return res.status(409).json({ error: 'Este perfil ya tiene PIN.' });
    }
    const session = await startSession(userId);
    const profile = await getProfile(userId);
    res.json({ ...session, userId, cryptos: profile?.cryptos ?? null });
  } catch (err) {
    console.error('[Auth] setup:', err.message);
    res.status(500).json({ error: 'No se pudo guardar el PIN.' });
  }
});

router.post('/login', async (req, res) => {
  const userId = String(req.body?.userId ?? '').toLowerCase();
  const pin = String(req.body?.pin ?? '');
  if (!isKnownProfile(userId)) return res.status(404).json({ error: 'Perfil desconocido' });
  try {
    const profile = await getProfile(userId);
    if (!profile?.pinHash) return res.status(404).json({ error: 'Este perfil todavía no tiene PIN.', code: 'NO_PIN' });

    const lock = lockState(profile);
    if (lock.locked) {
      res.set('Retry-After', String(lock.retryAfterSec));
      return res.status(429).json({ error: `Demasiados intentos. Probá de nuevo en ${Math.ceil(lock.retryAfterSec / 60)} min.`, code: 'LOCKED', retryAfterSec: lock.retryAfterSec });
    }

    const { ok, upgrade } = checkPin(profile, pin, userId);
    const patch = afterAttempt(profile, ok);
    if (ok && upgrade) Object.assign(patch, makeCredential(pin));        // migra el hash viejo a scrypt
    await updateProfile(userId, patch);

    if (!ok) {
      const left = attemptsLeft(profile, false);
      return res.status(401).json({
        error: patch.lockedUntil ? `PIN incorrecto. Perfil bloqueado ${Math.round((patch.lockedUntil - Date.now()) / 60000)} min.` : `PIN incorrecto. Te quedan ${left} intento${left === 1 ? '' : 's'}.`,
        code: 'BAD_PIN', attemptsLeft: left, max: MAX_FAILS
      });
    }
    const session = await startSession(userId);
    res.json({ ...session, userId, cryptos: profile.cryptos ?? null });
  } catch (err) {
    console.error('[Auth] login:', err.message);
    res.status(500).json({ error: 'No se pudo verificar el PIN.' });
  }
});

router.post('/logout', requireSession, async (req, res) => {
  try { await deleteSession(req.sessionId); } catch (err) { console.warn('[Auth] logout:', err.message); }
  res.json({ ok: true });
});

router.get('/me', requireSession, async (req, res) => {
  try {
    const p = await getProfile(req.userId);
    res.json({ userId: req.userId, cryptos: p?.cryptos ?? null });
  } catch (err) {
    console.error('[Auth] me:', err.message);
    res.status(500).json({ error: 'No se pudo leer el perfil.' });
  }
});

router.put('/cryptos', requireSession, async (req, res) => {
  const cryptos = req.body?.cryptos;
  if (!Array.isArray(cryptos) || cryptos.length > 20 || !cryptos.every(c => typeof c === 'string' && COIN_RE.test(c))) {
    return res.status(400).json({ error: 'Lista de monedas inválida.' });
  }
  try {
    await updateProfile(req.userId, { cryptos: [...new Set(cryptos)] });
    res.json({ ok: true, cryptos });
  } catch (err) {
    console.error('[Auth] cryptos:', err.message);
    res.status(500).json({ error: 'No se pudo guardar.' });
  }
});

export default router;
