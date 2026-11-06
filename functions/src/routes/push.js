import { Router } from 'express';
import { savePushSubscription, deletePushSubscription } from '../config/database.js';
import { requireSession } from '../middleware/session.js';

const router = Router();

// Las suscripciones se guardan a nombre del usuario de la SESIÓN: los avisos son personales (su señal, sus USDT) y antes cualquiera
// podía registrar un dispositivo a nombre de otro perfil.
router.use(requireSession);

// POST /api/push/subscribe — guarda suscripción Web Push del dispositivo
router.post('/subscribe', async (req, res) => {
  const { subscription } = req.body ?? {};
  if (!subscription?.endpoint || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2000) {
    return res.status(400).json({ error: 'subscription requerida' });
  }
  try {
    await savePushSubscription(req.userId, subscription);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Push] subscribe:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la suscripción.' });
  }
});

// POST /api/push/unsubscribe — elimina suscripción
router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body ?? {};
  if (!endpoint || typeof endpoint !== 'string') return res.status(400).json({ error: 'endpoint requerido' });
  try {
    await deletePushSubscription(endpoint);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Push] unsubscribe:', err.message);
    res.status(500).json({ error: 'No se pudo quitar la suscripción.' });
  }
});

export default router;
