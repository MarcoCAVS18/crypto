# Crypto Context — guía para agentes

Dashboard personal de contexto de mercado y decisión (BTC, ETH, PAXG y futuros XAUUSDT). No es un bot de trading.

## Antes de trabajar en PAXG / motor de decisión

**Leé `docs/PAXG_AUDIT.md` primero.** Tiene el mapa del sistema, los bugs verificados con `archivo:línea`, la hoja de ruta por fases y el estado de cada una. No hace falta releer todos los servicios. Al terminar una fase, actualizá su checklist y la tabla de hallazgos en ese documento.

## Estructura

- `functions/` — **API desplegada** (Firebase Functions v2, Express, Firestore). Fuente de verdad de la lógica de servidor.
- `frontend/` — React + Vite + Zustand + Tailwind, desplegado en Firebase Hosting.
- `backend/` — servidor **legacy** (Render + SQLite), duplica `functions/`. No recibe los arreglos de la hoja de ruta (ver auditoría D9).
- `docs/` — documentación viva.

## Comandos

```bash
# API (Node 22)
cd functions && npm ci && npm test
# Frontend
cd frontend && npm ci && npm test && npm run build
```

Los tests usan `node --test` (sin dependencias extra). CI: `.github/workflows/ci.yml` corre ambos en cada PR.

## Convenciones

- Idioma de UI y mensajes: español rioplatense (vos/tenés).
- Un PR por fase de la hoja de ruta; commits chicos con tests. Nunca pushear a `main`.
- Deploy: push a `main` → `.github/workflows/deploy.yml` (hosting + functions; **no** índices ni reglas de Firestore).
- No datos sintéticos en decisiones; toda degradación de datos se muestra al usuario.
- Los servicios de `functions/src/services` son módulos ESM puros y testeables; evitá importar `firebase-admin` en ellos (usá `config/database.js` solo desde rutas/jobs).
- Egress de la sesión de desarrollo puede estar bloqueado (Coinbase, Yahoo, FRED, Groq): los tests no deben depender de red.
