# Crypto Context — guía para agentes

Dashboard personal de contexto de mercado y decisión (BTC, ETH, PAXG y futuros XAUUSDT). No es un bot de trading.

## Antes de trabajar en PAXG / motor de decisión

**Leé `docs/PAXG_AUDIT.md` primero.** Tiene el mapa del sistema, los bugs verificados con `archivo:línea`, la hoja de ruta por fases y el estado de cada una. No hace falta releer todos los servicios. Al terminar una fase, actualizá su checklist y la tabla de hallazgos en ese documento.

## Backtester (`functions/src/backtest/`)

Lee `docs/BACKTEST.md` antes de tocarlo (protocolo, hallazgos sobre ruido/sobreajuste, cómo correrlo). Corre con historia real **solo en GitHub Actions** (`.github/workflows/backtest.yml`, manual o push a la rama de la fase): el sandbox de desarrollo no tiene red. Localmente sus tests usan datos sintéticos (`functions/test/helpers/synth.js`). Reglas: modelos pre-declarados en `candidates.js`, nunca mirar el hold-out, exigir p < 0.01 + hold-out coherente.

## Estructura

- `functions/` — **API desplegada** (Firebase Functions v2, Express, Firestore). Fuente de verdad de la lógica de servidor.
- `frontend/` — React + Vite + Zustand + Tailwind, desplegado en Firebase Hosting.
- `docs/` — documentación viva.

## Comandos

```bash
# API (Node 22)
cd functions && npm ci && npm test
# Frontend
cd frontend && npm ci && npm test && npm run build
```

Backtest con datos reales: Actions → *Backtest* → Run workflow (reporte en el resumen del job y artefacto `backtest-report`).

Los tests usan `node --test` (sin dependencias extra). CI: `.github/workflows/ci.yml` corre ambos en cada PR.

## Seguridad y límites (`functions/src/middleware/`)

Límites por IP en memoria (por instancia): general 240/min, IA 20/min, refrescos 6/min, `/api/health/ai` 6/min; cabeceras de seguridad y `CORS_ORIGINS` opcional. **El navegador no habla con Firestore**: el login por PIN, las sesiones y el portfolio pasan por `/api/auth/*` y `/api/portfolio/*` (PIN con scrypt, bloqueo tras 5 intentos, token de sesión `Authorization: Bearer`, cada usuario solo ve lo suyo). `firestore.rules` deniega todo al cliente; las reglas no se despliegan solas y hay que publicarlas *después* de desplegar el sitio nuevo (ver la auditoría §P5).

## Convenciones

- Idioma de UI y mensajes: español rioplatense (vos/tenés).
- Un PR por fase de la hoja de ruta; commits chicos con tests. Nunca pushear a `main`.
- Deploy: todo corre en Firebase (`pal-crypto.web.app`); push a `main` → `deploy.yml` (hosting + functions; índices/reglas de Firestore **solo** con el redeploy manual y `deploy_firestore`); `smoke.yml` verifica el sitio real. Netlify/Render se eliminaron (y `backend/`). Noticias: `news-relay.yml` (GitHub Actions, cada 30 min) las trae desde una IP no bloqueada y las guarda en Firestore; la API las usa cuando Cloud Functions recibe pocas. Ver `docs/DEPLOY.md`.
- No datos sintéticos en decisiones; toda degradación de datos se muestra al usuario.
- Los servicios de `functions/src/services` son módulos ESM puros y testeables; evitá importar `firebase-admin` en ellos (usá `config/database.js` solo desde rutas/jobs).
- Egress de la sesión de desarrollo puede estar bloqueado (Coinbase, Yahoo, FRED, Groq): los tests no deben depender de red.

## Secretos y variables (functions)

- `GROQ_API_KEY`, `FRED_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: secretos de Firebase (`firebase functions:secrets:set NOMBRE`), declarados en `functions/index.js`. Local: `functions/.env` (gitignored, ver `.env.example`).
- `GROQ_MODEL` (opcional): modelo de Groq; por defecto `openai/gpt-oss-120b`.
- Sin `FRED_API_KEY` todo sigue andando en **modo degradado** (visible en la tarjeta macro y en `GET /api/health/deep`).
- Estado de salud en vivo: `GET /api/health/deep` (config, frescura por insumo, último snapshot, advertencias, huella de la clave de Groq).
- Si la IA falla con 401: `GET /api/health/ai` prueba la clave de Groq en vivo (lista de modelos, sin gastar tokens) y dice si está mal cargada, pisada por otra clave, revocada o si el modelo no está disponible.
