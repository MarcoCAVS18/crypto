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
- **Backend:** Node.js + Express + SQLite
- **Data:** CoinGecko API

## Instalación Local

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

Abrir http://localhost:5173

## Deployment

- **Backend:** Render (https://crypto-7fbc.onrender.com)
- **Frontend:** Netlify

## Endpoints API

- `GET /api/crypto/:symbol` - Datos de BTC o PAXG
- `POST /api/crypto/decision` - Genera decisión basada en estado del usuario
- `GET /api/history` - Historial de decisiones

## Licencia

MIT
