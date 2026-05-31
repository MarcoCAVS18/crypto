import { Router } from 'express';
import { savePushSubscription, deletePushSubscription } from '../config/database.js';

const router = Router();

// POST /api/push/subscribe — guarda suscripción Web Push del dispositivo
router.post('/subscribe', async (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription?.endpoint) {
    return res.status(400).json({ error: 'userId y subscription requeridos' });
  }
  try {
    await savePushSubscription(userId, subscription);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/push/unsubscribe — elimina suscripción
router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint requerido' });
  try {
    await deletePushSubscription(endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
