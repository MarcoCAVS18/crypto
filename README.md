# Crypto Context Dashboard

Dashboard **personal** de contexto de mercado y decisión para BTC, ETH y PAXG (oro tokenizado) y futuros XAUUSDT.
No es un bot: responde tres preguntas para evitar operaciones impulsivas.

1. ¿Dónde estamos en el mercado? (Risk ON / neutral / Risk OFF, con los datos macro que lo explican)
2. ¿Dónde está el precio respecto de las zonas de compra/venta?
3. ¿Qué puedo hacer ahora con mi efectivo y mi posición? (tramos, tamaño, costo estimado)

> Las decisiones sobre PAXG están **calibradas con un backtest** (2001–2026) y medidas con resultados reales; ver
> [`docs/BACKTEST.md`](docs/BACKTEST.md). El score de mercado **no predice** el precio: sirve como contexto, y la política
> de DCA se apoya en lo que el backtest sí respaldó (no seguir al score, tilt acotado hacia la debilidad).

## Arquitectura

| Carpeta | Qué es |
|---|---|
| `functions/` | **API desplegada**: Firebase Functions v2 (Node 22, Express, Firestore). Motor de decisión, datos de mercado, jobs programados, backtester. |
| `frontend/` | React + Vite + Zustand + Tailwind, en Firebase Hosting (`/api/**` se reescribe a la función `api`). |
| `docs/` | `PAXG_AUDIT.md` (mapa, hallazgos, hoja de ruta y estado por fase) y `BACKTEST.md` (protocolo y resultados). |

- **Frontend:** React + Vite + TailwindCSS + Zustand
- **API:** Firebase Functions v2 (Node 22, Express, Firestore)
- **Data:** Coinbase, Yahoo Finance, FRED, CFTC, feeds RSS
Jobs programados (`functions/index.js`): `zoneWatcher` (push de zona de compra), `snapshotJob` (foto horaria del mercado, alerta de fuentes caídas) y `outcomeJob` (etiqueta resultados de las señales a 1/5/20/60 días).

Fuentes de datos: Coinbase (precios/velas), Yahoo Finance (DXY, GC=F, GVZ, plata), FRED (tasas, breakeven, dólar amplio, VIX), CFTC (COT), RSS de noticias y Groq (etiquetado de titulares y textos).

## Cómo se usa
1. **Portfolio:** cargá tus operaciones (monto, precio y unidades tienen que cuadrar; los decimales aceptan coma o punto).
2. **Tu posición** (Detalles): un solo dato, los **USDT que tenés disponibles**. El peso de cada posición se calcula solo con el Portfolio.
3. **Dashboard:** la señal (Comprar / Esperar / Vender) y, en "¿Por qué esta señal?", qué pesó en el score, cómo se decidió el tamaño y qué datos faltan.
El score del oro es **contexto, no predicción**: en 25 años de datos no anticipó el precio (ver `docs/BACKTEST.md`). La estrategia de fondo es un DCA con una inclinación acotada hacia comprar la debilidad.

## Desarrollo

```bash
# API (Node 22)
cd functions && npm ci && npm test
# Frontend
cd frontend && npm ci && npm test && npm run build && npm run dev
```

- Tests con `node --test` (sin dependencias extra); CI en cada PR (`.github/workflows/ci.yml`).
- Backtest con datos reales: **Actions → Backtest → Run workflow** (el entorno de desarrollo puede no tener red).
- Guía para agentes y convenciones: [`CLAUDE.md`](CLAUDE.md).

## Despliegue

Todo corre en **Firebase** (https://pal-crypto.web.app): Hosting + Functions + Firestore. Ver `docs/DEPLOY.md`.

Push a `main` → `.github/workflows/deploy.yml` (Hosting + Functions). **No** despliega reglas ni índices de Firestore: aplicarlos con
`firebase deploy --only firestore:rules,firestore:indexes` (ver la nota de seguridad de la auditoría antes de hacerlo).

## Secretos y configuración

Secretos de Firebase (`firebase functions:secrets:set NOMBRE`, y **redesplegar** después): `GROQ_API_KEY`, `FRED_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
Opcionales: `GROQ_MODEL`, `CORS_ORIGINS` (lista separada por comas; por defecto se refleja el origen).

Diagnóstico en vivo:
- `GET /api/health/deep` — configuración, frescura de cada insumo, último snapshot, versiones y parámetros vigentes, advertencias.
- `GET /api/health/ai` — prueba la clave de Groq sin gastar tokens y explica por qué falla.
- `GET /api/metrics/PAXG` — resultados reales de las señales contra la línea base.
