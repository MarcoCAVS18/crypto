// El portfolio es gestionado por el cliente React vía Firestore SDK directamente.
// Estas rutas existen solo para que Express no tire 404 si algo llama al endpoint.
import express from 'express';

const router = express.Router();

router.get('/operations', (_req, res) => res.json({ operations: [], count: 0 }));
router.get('/summary',    (_req, res) => res.json({ summary: [] }));
router.post('/operations', (_req, res) =>
  res.status(410).json({ error: 'Portfolio se gestiona desde el cliente con Firestore SDK.' })
);
router.delete('/operations/:id', (_req, res) =>
  res.status(410).json({ error: 'Portfolio se gestiona desde el cliente con Firestore SDK.' })
);

export default router;
