# Crypto Context Dashboard

Sistema de análisis y decisión para trading de BTC y PAXG.

## Objetivo

Herramienta de contexto que responde 3 preguntas:
1. ¿Dónde estamos en el mercado? (Risk ON/OFF/Neutral)
2. ¿Dónde está el precio respecto a zonas importantes?
3. ¿Qué puedo hacer yo ahora, con mi cash y este contexto?

**No es un bot de trading automático.** Es una herramienta para evitar operaciones impulsivas.

## Stack

- **Frontend:** React + Vite + TailwindCSS + Zustand
- **API:** Firebase Functions v2 (Node 22, Express, Firestore)
- **Data:** Coinbase, Yahoo Finance, FRED, CFTC, feeds RSS

## Instalación Local

```bash
# API
cd functions
npm ci
npm test

# Frontend
cd frontend
npm ci
npm run dev
```

Abrir http://localhost:5173

## Deployment

Todo corre en **Firebase** (https://pal-crypto.web.app): Hosting + Functions + Firestore. Ver `docs/DEPLOY.md`.

## Endpoints API

- `GET /api/crypto/:symbol` - Datos de BTC o PAXG
- `POST /api/crypto/decision` - Genera decisión basada en estado del usuario
- `GET /api/history` - Historial de decisiones

## Licencia

MIT
