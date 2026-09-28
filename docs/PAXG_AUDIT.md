# Auditoría PAXG — mapa, hallazgos y hoja de ruta

> **Documento vivo.** Leelo ANTES de tocar la lógica de PAXG: evita releer todo el código.
> Verificado contra `main` @ `56a7baf` (2026-09-28). Al cerrar cada fase, actualizá la sección 5 (estado) y la tabla 3.
> **Estado:** P0 ✅ mergeado (PR #41). P1 implementado en la rama `claude/paxg-phase1-data` (ver sección 9). Siguiente: **P2** (backtester y recalibración).
> Convención de IDs: `B#` = bug verificado · `D#` = debilidad de diseño · `P#` = fase de la hoja de ruta.

## 0. Cómo usar este documento

- Para trabajar en una fase: leé la sección 5 (checklist de esa fase) y las filas de la tabla 3 que cita. No hace falta releer los servicios.
- Cada hallazgo tiene `archivo:línea` (líneas de `main` @ `56a7baf`; pueden correrse) y cómo se verificó.
- Lo **no verificado** está marcado en la sección 7. Nunca lo trates como confirmado.
- Cada fase termina en **un PR propio** con tests. No mezclar fases.

## 1. Mapa del sistema

**Deploy real:** Firebase (`functions/` = API, `frontend/` = hosting). `.github/workflows/deploy.yml` despliega solo `hosting,functions` en push a `main` (NO despliega `firestore:indexes` ni `firestore:rules`).
**`backend/`** es el servidor legacy (Render + SQLite). Duplica los servicios de `functions/` y **no recibe los arreglos de esta hoja de ruta**. Decisión pendiente: eliminarlo (ver D9).

Flujo de datos de PAXG:

```
Coinbase PAXG-USD (velas 4h cerradas ×250 ≈ 41 días,   functions/src/services/marketData.js + candles.js
  agregadas desde 1h; paginado ≤300)
  → indicadores (EMA/RSI/ATR/VWAP 24h/swings)       services/technicalAnalysis.js
  → zonas buy/neutral/sell                          services/zoneCalculator.js
  → market mode técnico (score entero)              services/marketMode.js
Yahoo (DXY, ^TNX, ^GVZ, SI=F) + FRED (CSV DFII10 + API 7 series) + CFTC COT + RSS
                                                    services/macroService.js, fredService.js, newsService.js
Oro de referencia GC=F (2 años diarios): régimen EMA200, prima de PAXG   services/spotGold.js
  → Groq: sentimiento −1..1 (+ traducción)           services/groqAnalyzer.js
  → contexto de oro (caché Firestore 2h; `sources` = estado por insumo)  services/goldContext.js, dataHealth.js
  → market mode de oro (score −1..1, umbral ±0.25, `components`, `dataHealth`)  services/goldMarketMode.js
  → motor de reglas BUY/WAIT/SELL + tramos           services/decisionEngine.js
  → modulación por calendario (Groq) + insight (Groq) routes/crypto.js  (POST /api/crypto/decision)
  → historial idempotente por hora + features         services/decisionLog.js, config/database.js (Firestore `decisions`)
Calendario macro (fuente única, hora ET)             data/macroCalendar.js → GET /api/calendar (el frontend ya no tiene copia)
Groq (cliente único, GROQ_MODEL, reasoning_effort)   services/groqChat.js · helpers puros: services/aiHelpers.js
Antispam de push                                     services/zoneAlert.js (2 lecturas + cooldown 12 h)
Costo promedio ponderado (frontend)                  frontend/src/utils/portfolioMath.js
UI: frontend/src (App.jsx, store/appStore.js, components/DecisionPanel|MacroContext|MarketHero|…)
Push: scheduled/zoneWatcher.js (cada 60 min) + services/pushService.js
Snapshots: scheduled/snapshotJob.js (cada 60 min, PAXG+BTC) → services/snapshot.js → Firestore `snapshots`
Salud: GET /api/health (calendario) y GET /api/health/deep (config, frescura por insumo, último snapshot) → routes/health.js
```

Pesos del score de oro (`goldMarketMode.js`, **tras P0**): IA de titulares ±0.15 (antes 40 %), DXY ±0.25, 10Y ±0.20, técnico ±0.15; aditivos COT ±0.10, tasa real ±0.10, GVZ ±0.08, oro/plata ±0.07, tendencia diaria ±0.10 (hasta ±0.15). Mapeos continuos (interpolación lineal). Modo: `> 0.25` risk_on, `< −0.25` risk_off. Suma de máximos = 1.25 (se recorta a ±1). Pesos sin calibrar (P2).

Motor (`decisionEngine.js`): gates (cash<10 → WAIT; risk_off → WAIT; observación → WAIT) → `decideInversionMode` (P&L vs promedio, zonas, umbrales PAXG venta 30 %/45 %, fracción de capital por score/COT/tasa real/GVZ/tendencia diaria) o `decideTradingMode` (**no accesible desde la UI**: `UserStateInput` solo ofrece inversión y observación).

Frontend: `appStore.getDecision()` arma `portfolioContext` (promedio, `executedBuys` de los últimos 4 días) y llama a `POST /api/crypto/decision`. `loadCryptoData` repite la decisión cada 5 min mientras la app esté abierta (`AUTO_REFRESH_INTERVAL`).

Perfiles (`frontend/src/data/profiles.js`): marco, tomas, victor. Auth = PIN en Firestore (`firestoreAuth.js`).

## 2. Datos externos y sus particularidades

| Fuente | Uso | Particularidad |
|---|---|---|
| Coinbase Exchange `/candles` | velas | Granularidades nativas (por confirmar en vivo): 60, 300, 900, 3600, 21600, 86400. **4h (14400) no existe**: se agrega desde 1h (`candles.js`). Devuelve la vela en curso (por confirmar): se descarta. Máx 300 velas/request: se pagina en paralelo. Omite las horas sin operaciones (PAXG ilíquido): un balde 4h con ≥1 vela es válido. |
| Yahoo `v8/finance/chart` | DXY, ^TNX, ^GVZ, SI=F, **GC=F** | Endpoint no oficial (puede bloquear IPs de Cloud Functions → por eso los fallbacks y el modo degradado). Cambio diario con los 2 últimos cierres (B12). GC=F: 2 años diarios para el régimen. |
| FRED API `series/observations` (`FRED_API_KEY`) | DFII10, DGS10, DGS2, T10YIE, DTWEXBGS, VIXCLS, GVZCLS | Gratis (120 req/min). Faltante = `"."`. DTWEXBGS se publica semanalmente (vence a los 12 días). La clave nunca se loguea. |
| FRED `fredgraph.csv?id=DFII10` | tasa real 10Y (sin clave) | CSV; faltante = `.` (viejo) o vacío (nuevo). Ver B2. Sigue siendo la fuente principal de `realYield`; la API la completa/enriquece. |
| CFTC Socrata `6dca-aqww` | COT (legacy, no-comercial) | Umbrales absolutos 200k/80k/0 sin normalizar por open interest (D3). |
| RSS (Google News ×2, Kitco, Yahoo GLD) | titulares | Sin dedupe semántico ni ponderación por fuente. |
| Groq `openai/gpt-oss-120b` | sentimiento, traducción, calendario, insight, chat, futuros | Modelo de **razonamiento**: el razonamiento gasta el presupuesto de `max_tokens` (B11). Params documentados: `reasoning_effort` low/medium/high, `include_reasoning`. |

## 3. Registro de hallazgos

Estado: ⬜ pendiente · 🟡 implementado en el PR de su fase (pasa a ✅ al mergear) · ✅ mergeado. "parcial" = queda un resto asignado a otra fase. Fase = dónde se arregla.

### Críticos (deciden mal)

| ID | Hallazgo | Dónde | Evidencia | Fase | Estado |
|---|---|---|---|---|---|
| B1 | **Costo promedio roto tras ventas**: `(invertido − cobrado)/unidades`. 1u@4000 y vender 0.3u@4800 → app promedio $3.657, P&L +31 % (real +20 %) → cruza el umbral de venta 30 % de PAXG. Vender la mitad a 8000 → promedio $0 → `hasPosition=false`. | `frontend/src/store/appStore.js:28-36` | Reproducido copiando la fórmula literal | P0 | ✅ |
| B2 | **Tasa real (FRED) nunca se lee**: el filtro `!valor.includes('.')` descarta todos los decimales; con CSV nuevo (vacío) o viejo (`.`) lanza error. Señal apagada en silencio (score, fracción de capital, override neutral, prompt IA). | `functions/src/services/macroService.js:193` | Probado con ambos formatos sobre el filtro literal | P0 | ✅ |
| B3 | **Indicadores sobre datos equivocados**: (a) `timeframe='4h'` se ignora, todo corre sobre 250 velas de 1h ≈ 10 días (la "EMA200" es de ~8 días); (b) la vela en formación entra a RSI/ATR/volumen: primeros ~24 min de cada hora dan volumen "muy bajo" (−1 al score) — asume que Coinbase la devuelve; (c) si Coinbase falla se usan velas sintéticas con `Math.random()` y el motor igual decide; (d) ATR% de PAXG en 1h ≈ 0,2 % → `<1.5 %` da +1 casi siempre y las ramas 3 %/5 % son código muerto; (e) VWAP acumulado desde hace 10 días. | `routes/crypto.js:83,175`, `marketData.js:45-48`, `technicalAnalysis.js:138`, `marketMode.js:29-41` | Simulación con volatilidad de oro (ATR% mediano 0,228 %; 100 % de ventanas < 1,5 %); Exp. 8 de volumen | P0 (a-parcial: cerrar vela, gate sintéticas, VWAP) / P1 (timeframes reales) / P2 (umbrales ATR calibrados) | 🟡 parcial (P1 hizo los timeframes reales; queda: umbrales ATR → P2) |
| B4 | **Calendario macro**: el evento desaparece a las 00:00 UTC del mismo día (FOMC es 14:00 ET); `daysUntil` nunca es 0; 2 de 8 fechas contrastadas estaban mal (FOMC junio 10 vs 16–17; CPI sept 10 vs 11); termina 2026-12-18; 3 copias (backend, functions, frontend). | `functions/src/data/macroCalendar.js:60-75`, `frontend/src/data/macroCalendar.js` | Exp. 7 + contraste con federalreserve.gov y bls.gov | P0 | ✅ |
| B5 | **Sin salida de riesgo**: cash < 10 % bloquea también las VENTAS; risk_off nunca recorta. Con +50 %, RSI 78, zona de venta: cash 5 % → WAIT "sin cash"; risk_off → WAIT. | `decisionEngine.js:18,29` | Exp. 5 (gates) | P0 (mínimo) / P3 (salidas por régimen) | ✅ |
| B6 | **Score macro poco confiable**: la IA ya recibe DXY/10Y/COT/tasa real y luego se re-suman (doble conteo); COT/tasa real/GVZ/tendencia diaria se reusan en la fracción de capital y en el override neutral; la IA sola cambia el modo con \|score\| ≥ 0,63; escalones (DXY +0,149 %→+0,151 % mueve el score −0,125); sin histéresis. | `goldMarketMode.js:45-232`, `groqAnalyzer.js:24-96` | Exp. 4 (barrido de sensibilidad) | P0 (doble conteo, tope IA, continuidad) / P2 (histéresis, z-scores) | ✅ parcial (queda: histéresis, z-scores → P2) |

### Importantes

| ID | Hallazgo | Dónde | Evidencia | Fase | Estado |
|---|---|---|---|---|---|
| B7 | **Zonas inestables**: banda ±ATR horario (~0,2 %) pero relleno fijo ±2 % sobre el último swing → la zona depende del último extremo de ~10 días. En simulación cambia en ~23 % de las horas (dura ~4,4 h). El "R/R estimado" nunca supera 0,33 (artefacto de 0,5/1,5×ATR). En la ruta DCA el tramo 3 "mínimo de zona" queda a −0,3 % (encima del tramo 2 a −1,5 %) con 40 % del monto. | `zoneCalculator.js:45-100`, `decisionEngine.js:108-124,465` | Exp. 1-3 (sintético; propiedades estructurales, frecuencias ilustrativas) | P0 (tramos, R/R) / P2 (zonas) | ✅ parcial (queda: zonas inestables → P2) |
| B8 | Mensaje PAXG usa 25 % en vez de 30 %: dice "subir −1,0 % adicional". | `decisionEngine.js:300-308` | Exp. 4 | P0 | ✅ |
| B9 | **`zoneWatcher` desplegado y roto**: importa `fetchMarketData` (no existe) y pasa `symbol` como 3er arg de `calculateZones`. Nunca salió un push. Además la zona flipea (B7) → habría spam. | `scheduled/zoneWatcher.js:17,25,30`, `index.js:27` | Reproducido (TypeError ×2) | P0 | ✅ |
| B10 | **Historial no medible**: se guarda una decisión cada 5 min por pestaña abierta; `getDecisionsBySymbol` sin `orderBy` → subconjunto arbitrario (orden por ID auto); no se guardan features/horizonte; "AI Signal History" solo cuenta BUY/WAIT/SELL; `savedToHistory` siempre `false`. | `config/database.js:18,41`, `routes/crypto.js:290-308`, `BacktestStats.jsx` | Lectura + semántica documentada de Firestore | P0 (dedupe/orden) / P1 (snapshots) / P4 (métricas) | 🟡 parcial (P1 hizo los snapshots; queda: métricas → P4) |
| B11 | **Capa de IA**: fallos cacheados 2 h; sin `reasoning_effort` (gpt-oss razona y gasta `max_tokens`); prompt del insight sesgado ("destacá la consistencia"); outcome ✓/✗ por signo del precio sin importar BUY/SELL/WAIT; `optimalEntryPrice` inventado por el LLM se muestra como "Entrada sugerida"; clave de caché del insight usa buckets de $500 (pensados para BTC); el chat no recibe motivo/razones y espera `pnlPercent`/`currentValue` que nunca se envían. | `goldContext.js:123`, `groqAnalyzer.js:255-316`, `routes/crypto.js:262-264`, `FloatingChat.jsx:7-18` | Lectura + búsqueda de docs Groq | P0 | ✅ |
| B12 | **Yahoo "% hoy" probablemente es cambio de 5 días**: con `range=5d`, `chartPreviousClose` suele ser el cierre previo a la ventana. | `macroService.js:57` | **NO verificado** (egress bloqueado). Arreglo robusto: usar los 2 últimos cierres | P0 | ✅ |

### Otros

| ID | Hallazgo | Fase | Estado |
|---|---|---|---|
| B13 | **Seguridad**: `firestore.rules` con `if true` en `portfolio_operations` y `user_profiles` (hash SHA-256 de PIN legible, fuerza bruta trivial); `/api/chat` y `/api/gold-context/refresh` sin auth ni rate-limit (queman la cuota de Groq); CORS `origin: true`. | P5 | ⬜ |
| B14 | Deuda: dos backends duplicados; modo trading inalcanzable; `evaluateSignalStrength`, `getModeDescription`, `calculateDistanceToZones`, `multiTimeframeData` sin uso; README desactualizado (CoinGecko/SQLite); **sin tests**. | P0 (tests) / P5 | ✅ parcial (tests + CI hechos; resto → P5) |
| B16 | **Órdenes de venta incoherentes**: la recomendación decía 30 %/50 % pero las órdenes mostraban 35 % + "venta adicional" del 65 % (el resto entero) contradiciendo "no salir completamente". | P0 | ✅ |
| B17 | **Futuros XAUUSDT** (`futuresAnalysis.js`, `analyzeFuturesDirection`): el LLM decide dirección, apalancamiento, stop y `positionUsd` sin guardarraíles determinísticos (tope de riesgo por operación, validación contra cash/volatilidad). Módulo nuevo, fuera del alcance de P0. | P3/P5 | ⬜ |
| B18 | **Trabajo posterior a la respuesta**: en Cloud Functions no está garantizado; escrituras de historial y de caché de IA iban "fire-and-forget". | P0 | ✅ |
| B15 | **Velas de gráfico**: `granularity=15m` no está en `granMap` y cae a diario (el gráfico "1D" muestra 96 velas diarias); `4h` (14400) no lo soporta Coinbase (por confirmar) → falla el gráfico "1M". | `routes/crypto.js:56-60`, `MarketHero.jsx:34-37` | P1 | 🟡 |

### Debilidades de diseño (no bugs)

- **D1** Cada señal entra 2–3 veces (score, fracción de capital, override neutral).
- **D2** Umbrales de nivel absolutos (10Y 3.5/4.0/4.25/4.75; oro/plata 70/80/90; GVZ 15/20/25; tasa real 0/1/2) sin z-score ni cambio; dependen del régimen. *P2: el backtest no respalda un reemplazo estimado; siguen vigentes como criterio experto sin respaldo histórico.*
- **D3** COT: `contrarian_bull` exige net ≤ 0 (prácticamente inalcanzable hoy); `crowded_long` (>200k) pelea contra la tendencia en mercados alcistas; sin normalizar por open interest. *P2: `netSpecPercentile` (3 años) disponible como dato informativo; el score aún usa los umbrales absolutos.*
- **D4** SELL atado al P&L del usuario (costo hundido), no al estado del mercado; umbrales 30 %/45 % arbitrarios y dependientes de su camino.
- **D5** Sin tope de exposición: `dcaOpportunity` puede repetir BUY "fuerte" cada 4 días promediando a la baja; `isHighlyConcentrated` solo cambia el texto, no el tamaño.
- **D6** Sin costos: no compara edge esperado vs comisión + spread de PAXG.
- **D7** Sin serie de oro spot (PAXG existe desde 2019; sin prima/descuento vs XAU) → backtest imposible con la data actual.
- **D8** El LLM tiene el peso más alto (40 %) y es la señal menos reproducible y no backtesteable (no se loguea el input/salida por punto en el tiempo).
- **D9** `backend/` duplicado y desincronizado del deploy real.
- **D10** `cashPercent`/`totalCapital` son manuales, desconectados del portfolio.

## 4. Principios de diseño (para no re-discutirlos)

1. Primero correcto y medible, después inteligente. No prometemos predecir el oro.
2. Modelos simples, regularizados e interpretables (poca data efectiva). ML solo para calibrar.
3. El LLM no puntúa: extrae etiquetas estructuradas con peso acotado y explica; gana peso solo si el log demuestra valor incremental.
4. Reglas determinísticas para eventos y gates; nada de riesgo de calendario decidido por un LLM.
5. Nunca decidir con datos sintéticos ni degradados sin decirlo; degradación explícita en la UI.
6. Decisiones según el estado del mercado y del portafolio objetivo, no según el precio de entrada.
7. Cada cambio de comportamiento lleva test; cada fase, su PR.

## 5. Hoja de ruta y estado

Cada fase = un PR. Marcar `[x]` al mergear.

### P0 — Correcciones + tests  → ✅ mergeado (PR #41)
- [x] Infra de tests (`node --test`, sin dependencias) + CI de PR (`.github/workflows/ci.yml`)
- [x] B1 costo promedio ponderado (`portfolioMath.js`) + uso en motor/insight/preview DCA; el resumen se recalcula al rehidratar el store
- [x] B2 parser FRED · B12 cambio diario Yahoo con los 2 últimos cierres
- [x] B3 (parcial): descartar vela en curso, volumen contra las velas anteriores, VWAP 24 velas, velas "stale" antes que sintéticas, gate de sintéticas en el motor y en `zoneWatcher`. **Resto:** timeframes reales (P1), umbrales ATR (P2)
- [x] B4 calendario con hora ET/DST, día del evento, fechas verificadas (`verified`), cobertura en `/api/health`, endpoint único `/api/calendar`, copia del frontend eliminada
- [x] B5 cash bajo no bloquea SELL; risk_off recorta si hay ganancia + zona de venta. **Resto:** salidas por régimen (P3)
- [x] B6 sin macro en el prompt de IA, IA ±0.15, mapeos continuos, razón explícita si la IA falla. **Resto:** histéresis y z-scores (P2)
- [x] B7 tramos estrictamente descendentes; R/R solo con swings/EMA reales · B8 mensaje con umbral 30 % · B16 órdenes de venta coherentes. **Resto:** zonas (P2)
- [x] B9 `zoneWatcher` funcional + antispam (2 lecturas + cooldown 12 h); handler separado de `run(deps)` porque `onSchedule` pasa el evento como 1er argumento
- [x] B10 una señal por símbolo y hora (`create()`), lectura por rango de ID sin índice compuesto, snapshot básico de features. **Resto:** snapshots completos (P1), métricas (P4)
- [x] B11 helper único de Groq (`reasoning_effort`, colchón de tokens, reintento), TTL corto de fallos, prompt/outcome/insight/cache/chat corregidos, `GROQ_MODEL` configurable · B18 escrituras esperadas antes de responder

### P1 — Fundamentos de datos  → implementado (rama `claude/paxg-phase1-data`)
- [x] FRED API (`fredService.js`: DFII10, DGS10, DGS2, T10YIE, DTWEXBGS, VIXCLS, GVZCLS) con historia (~400 días), cambio 1/5/20, z-score y percentil a 1 año, frescura ok/stale/failed por serie; fallbacks a FRED para GVZ, 10Y y tasa real cuando falla la fuente principal. Secreto `FRED_API_KEY` declarado en `index.js`. **Las features todavía NO entran al score** (P2).
- [x] Oro de referencia GC=F (`spotGold.js`): ~2 años de velas diarias → régimen con EMA200 real (`dailyBias.longAlignment`, `extension200Pct`, `atrPercent`); la regla `alignment` histórica se conserva (no cambia el score); respaldo: velas diarias de PAXG. Prima/descuento de PAXG vs GC=F (informativa, sesgada por la base de futuros; `stale` si la referencia tiene >6 h).
- [x] Velas (B3a, B15): `candles.js` (agregado 1h→4h alineado a UTC, ventanas ≤300, merge); el análisis técnico usa **250 velas de 4h cerradas (~41 días)** en vez de 250 de 1h; VWAP de 24 h reales; `/candles` acepta `15m`/`1h`/`4h`/`6h`/`1d` y valida.
- [x] Modo degradado (`dataHealth.js`): estado por insumo (`sources` en el contexto de oro), `dataHealth` en el modo de mercado, razón "Datos degradados…" primero, aviso en la tarjeta macro y, con degradación **severa**, una compra baja un escalón de intensidad. `GET /api/health/deep` (sin llamadas externas: lee el caché) con configuración, frescura, snapshots y advertencias.
- [x] Snapshot horario (`snapshot.js` + `scheduled/snapshotJob.js`, colección `snapshots`, id `SYMBOL_YYYYMMDDHH`, `create()` idempotente): precio, técnicos, zona, score con **componentes** (`goldMarketMode` ahora devuelve `components`), macro completo, FRED, régimen, prima, `dataHealth` y estado de fuentes. Foto del **mercado** (sin datos de usuario). PAXG y BTC.

### P2 — Backtester y recalibración  → implementado (rama `claude/paxg-phase2-backtest`)
- [x] Backtester point-in-time (`functions/src/backtest/`, ver `docs/BACKTEST.md`): GC=F + FRED + COT + GVZ desde 2000; features sin fuga (rezagos de publicación, test de propiedad), walk-forward con embargo por etiqueta, hold-out de 2 años aislado (también sus etiquetas), menú de modelos pre-declarado, test de permutación, conteo de comparaciones; simulador de DCA con gasto igualado, ventanas móviles y placebo por desplazamiento. Corre en GitHub Actions (`.github/workflows/backtest.yml`).
- [x] **Resultado real (54 comparaciones): ningún modelo predice el retorno del oro a 20/60 días fuera de muestra; el score actual no tiene poder predictivo demostrable (IC −0.10/−0.13, signo levemente contrario).** Única señal consistente: en DCA, *comprar más cuando el score es bajo* abarata ~1 % el costo promedio (hold-out: 0.5 %) y *comprar menos* lo encarece; es hipótesis para P3, no regla.
- [x] Runtime: ATR por percentil histórico (`atrPercentile`; reemplaza umbrales absolutos solo en el modo de oro) · histéresis del modo (entra ±0.25, sale ±0.15, modo previo del último snapshot < 6 h; `previousMode.js`) · percentil COT a ~3 años (informativo) · monitor de desacople oro↔tasa real (`decoupling.js`; advertencia en razones y snapshot, no reasigna pesos) · snapshot `p2` (atrPercentile, histéresis, percentil COT, desacople).
- [ ] **Diferido a P3:** artefacto de modelo estimado en runtime (no hay modelo con evidencia que desplegar) y z-scores en el score en vivo (el backtest no respalda reemplazar los mapeos por niveles/cambios estimados).

### P3 — Política, cartera y LLM  → parte 1 implementada (rama `claude/paxg-phase3-policy`); resto pendiente
- [x] **Política de DCA de PAXG con evidencia** (`services/dcaPolicy.js`, evaluada en el backtest con el mismo mapeo): base fija (75 % del efectivo asignado) con un **tilt acotado ×0.5–×1.5 hacia comprar más cuando el score es bajo**. Reemplaza la fracción que *seguía* al score (0.65/0.80/1.0) y los recortes por COT/tasa real/GVZ/tendencia (doble conteo con el score; el backtest mostró que seguir al score encarece el costo promedio +0.5 %).
- [x] **Gate de acumulación:** PAXG en `risk_off` ya no queda siempre en WAIT: sigue acumulando en zona de compra o bajo el promedio (tamaño por la política), salvo posición concentrada (>70 %), efectivo < 30 % o tramos ya ejecutados. Las ventas por macro adverso no cambian. BTC/ETH no cambian.
- [x] Volatilidad realizada como señal de tamaño: probada, sin efecto (±0.01 %) → **no se usa**. Caída desde el máximo de 1 año: no confirmada en el hold-out (p 0.35) → no se usa.
- [x] Registro: cada decisión guarda `dcaPolicy` (versión, multiplicador, fracción); `modelVersion` de decisiones pasa a `p3`.
- [ ] Peso objetivo del sleeve de oro + bandas; escalones por cuantiles de retrocesos; tamaño por volatilidad *de la posición* (Kelly fraccional acotado — sin evidencia aún)
- [ ] Salidas por rotura de tendencia + macro adverso; recorte por sobre-extensión; costos (comisión + spread; el efecto medido del tilt, ~0.3 %, es menor que una comisión: hay que modelarlos antes de más sofisticación)
- [ ] Eventos: multiplicador determinístico por horas-al-evento (ET), blackout, ventana post-evento
- [ ] LLM como etiquetador estructurado (peso ±0.05–0.10, logueado) + explicador con paquete de decisión

### P4 — Aprendizaje continuo
- [ ] Jobs que etiquetan resultados a 1/5/20/60 días (retorno, MAE/MFE), hit rate, calibración/Brier, vs baselines
- [ ] Reemplazar "AI Signal History" por métricas reales; modo sombra (champion/challenger); alertas de fuente caída; seguimiento de si seguiste la señal

### P5 — Ingeniería y seguridad
- [ ] Decidir/eliminar `backend/`; núcleo puro compartido; config versionada; README
- [ ] Reglas de Firestore con auth real; rate-limit en `/api/chat` y `/refresh`; App Check

## 6. Decisiones abiertas / supuestos

- Tope de la IA en el score: se fija en ±0.15 en P0 (antes ±0.40) hasta que el log demuestre valor (P4).
- Los arreglos de P0 se aplican solo a `functions/` y `frontend/`. `backend/` queda congelado (D9).
- El peso de la IA bajó de 40 % a 15 % en el score: hay **más lecturas neutral** hasta calibrar (P2). Es un cambio de comportamiento deliberado.
- `zoneWatcher` ahora envía pushes (antes fallaba siempre): usuarios con notificaciones activas empezarán a recibirlos, máx. 1 cada 12 h por símbolo.
- El historial de decisiones cambia de ID automático a `SYMBOL_YYYYMMDDHH` (1 señal por hora, la primera gana); los documentos viejos se siguen leyendo como respaldo transitorio (`getDecisionsBySymbol`, TODO eliminar). La señal guardada es la del **primer usuario de esa hora** (multiusuario: separar señal de mercado y recomendación personal en P1).
- Fechas del calendario sin contrastar quedan con `verified:false` y se muestran como "fecha por confirmar"; automatizar con FRED `release/dates` (P1/P3).
- Modelo de Groq configurable con `GROQ_MODEL` (por defecto `openai/gpt-oss-120b`); `reasoning_effort:'low'` solo se envía a modelos gpt-oss.
- Fees no se incluyen en el costo base (mismo criterio que antes); revisar en P3 con el modelo de costos.
- Firestore: `deploy.yml` no despliega índices; por eso el historial se lee por rango de ID de documento (sin índice compuesto).
- **P1 — timeframe del análisis:** ahora 250 velas de 4h cerradas (antes 250 de 1h). Cambia zonas, market mode técnico e indicadores; los umbrales de ATR% y el relleno ±2 % de las zonas siguen sin calibrar (P2).
- **P1 — régimen y prima informativos:** `longAlignment`, `extension200Pct` y la prima de PAXG **no** entran al score todavía; se registran en snapshots para evaluarlos en P2/P4.
- **P1 — degradación severa** (sin DXY y 10Y, o ≥3 insumos del score faltantes): una compra baja un escalón de intensidad y lleva advertencia. La degradación parcial solo se muestra.
- **P1 — snapshots:** foto del mercado, sin datos de usuario; PAXG y BTC cada hora (`snapshotJob`, ~24 docs/día por símbolo). Las reglas de Firestore no se despliegan solas: aplicar con `firebase deploy --only firestore:rules` si se quiere la regla explícita (sin regla, el cliente ya queda denegado por defecto).
- **P1 — FRED:** las features (z-score, cambio 20d, percentil) se guardan pero no puntúan hasta P2. La tasa real sigue viniendo primero del CSV público; la API la completa/enriquece.

- **P2 — el score no se recalibra con ponderaciones estimadas:** el backtest no encontró modelo con evidencia (p < 0.01 + hold-out). Se mantienen los pesos expertos actuales, ahora declarados *sin respaldo histórico*; no se presentan como predicción. Cualquier ponderación nueva exige pasar el mismo protocolo.
- **P2 — la histéresis y el ATR por percentil cambian el comportamiento del modo de oro** (menos parpadeo; volatilidad juzgada contra el propio historial). El modo previo se toma del último snapshot (< 6 h); sin snapshot rige el umbral simple.
- **P2 — GC=F como proxy de PAXG** en todo el backtest (PAXG existe desde 2019).
- **P2 — hipótesis para P3:** el DCA con gates que *reducen* compras con score bajo (risk_off) empeoró el costo promedio (+0.5 %, ganó en 10 % de ventanas). Revisar en P3 si los gates de compra por modo deben pasar a *sizing informativo* o invertirse (comprar más en debilidad), con costos y hold-out.

- **P3 — cambio de comportamiento deliberado (PAXG):** en `risk_off` ahora puede recomendar BUY (antes siempre WAIT salvo venta). Base: el backtest (2001–2026 + hold-out) mostró que reducir compras con score bajo encarece el costo promedio y que el tilt hacia la debilidad lo abarata ~0.3 % (p 0.003, hold-out 0.24 %). **Efecto pequeño, pocas muestras independientes, placebo algo liberal**: es una política prudente (acotada, con salvaguardas), no una promesa de rendimiento. Para revertir: `DCA_POLICY.tilt` en `dcaPolicy.js` y la rama `isPaxg` de `risk_off` en `decisionEngine.js`.

## 7. Verificación

**Cómo se verificó** (con el código real del repo sobre series sintéticas de volatilidad de oro ≈ 0,17 %/h y fixtures; egress a Coinbase/Yahoo/FRED/Groq bloqueado en la sesión de auditoría):

- Zonas/ATR/R-R/tramos: ATR% mediano 0,228 %; "volatilidad controlada" en 100 % de ventanas; R/R máx 0,33; zona cambia ~22,7 %/h (duración media 4,4 h); acción BUY↔WAIT cambia ~15 %/h. Las *propiedades* son estructurales; los *porcentajes* son ilustrativos.
- Sensibilidad del score: IA sola cambia el modo con |score| ≥ 0,63; escalón DXY = −0,125.
- Calendario: FOMC (2026-09-16) visible hasta 23:59 UTC del día previo y **no** a partir de 00:01 UTC del día del evento; 11 eventos restantes desde 2026-09-28.
- Costo promedio, FRED y gates: ver filas B1, B2, B5.
- **P2 (con datos reales, en GitHub Actions):** FRED CSV (7 series, historia completa), Yahoo GC=F/SI=F/DX-Y.NYB desde 2000 (`range=max` degradaba a ~270 filas: se usan fechas explícitas) y CFTC Socrata (1935 semanas) responden correctamente desde Actions; Stooq devuelve 403. Runs #4 y #5 del workflow *Backtest*. Yahoo GC=F ≥ 250 velas diarias (ítem de P1) queda confirmado indirectamente (6544 filas).

**No verificado (confirmar con un comando):**

- Yahoo `chartPreviousClose` (B12):
  `curl -s -A Mozilla/5.0 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d' | jq '.chart.result[0].meta.chartPreviousClose, .chart.result[0].indicators.quote[0].close'`
- Vela en curso de Coinbase (B3b): el último elemento de `/candles?granularity=3600` ¿tiene `time` = hora actual?
- Formato vigente del CSV de FRED: `curl -s 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10' | tail -3` (el parser nuevo acepta ambos).
- Truncamiento de gpt-oss por presupuesto de tokens (B11): revisar `choices[0].finish_reason === 'length'` y `usage`.
- Granularidades de Coinbase (B15) y que una ventana de ≤299 velas de 1h no dispare "granularity too small".
- **P1:** formato real de la respuesta de FRED `series/observations` (`observations[].value` como string, faltante `"."`); `GC=F` en Yahoo (`range=2y`) devuelve ≥250 velas diarias válidas; que Yahoo no bloquee las IPs de Cloud Functions (si lo hace, el modo degradado lo mostrará en `/api/health/deep`).
- **P1:** primera ejecución de `snapshotJob` (revisar logs `[Snapshot] {"PAXG":"saved","BTC":"saved"}`) y que `GET /api/health/deep` muestre `snapshots.last` con edad < 60 min.
- **P1:** con `FRED_API_KEY` cargada, `/api/health/deep` → `goldContext.sources.fred.status = ok` y `config.fredKey = true`.

## 8. Fechas de calendario contrastadas (fuente oficial)

Verificadas (`verified: true` en `macroCalendar.js`):
- FOMC 2026 (federalreserve.gov): 27–28 ene, 17–18 mar, 28–29 abr, **16–17 jun**, 28–29 jul, 15–16 sep, **27–28 oct** (decisión 14:00 ET del 2.º día). Dic 8–9: sin contrastar.
- BLS Empleo: ago → vie 4 sep · sep → vie 2 oct · nov → vie 4 dic. BLS CPI: ago → **vie 11 sep** · sep → **mié 14 oct**. (8:30 ET)
- BEA PCE: jul → 26 ago · ago → **30 sep** (8:30 ET). El repo tenía 28-ago y 25-sep.

Sin contrastar (`verified: false`, "fecha por confirmar"): PCE sep (30-oct), NFP oct (6-nov), CPI oct (12-nov), PCE oct (25-nov), FOMC dic (9-dic), CPI nov (10-dic), PCE nov (18-dic). Fuente para automatizar: FRED `release/dates` (CPI id 10, Empleo id 50, PCE id 54) y el calendario de la Fed.

## 9. Historial de fases

### P0 — Correcciones + tests (rama `claude/paxg-phase0-fixes`)
- Tests: 111 en `functions/test` (`npm test`) + 11 en `frontend/src/utils` (`npm test`); CI de PR.
- Commits (uno por unidad): docs · infra/CI · costo promedio (B1) · parsers macro (B2, B12) · velas (B3) · calendario (B4) · motor (B5, B7, B8, B16) · score de oro (B6) · zoneWatcher (B9) · historial (B10) · capa de IA (B11, B18) · fix del handler del scheduler.
- Verificado con tests y `vite build`. **No verificado en vivo** (egress bloqueado en la sesión): comportamiento real de Groq con `reasoning_effort`, Coinbase (vela en curso, granularidades), Yahoo, FRED. Confirmar en staging con los comandos de la sección 7.
- `backend/` no se tocó (D9).

### P1 — Fundamentos de datos (rama `claude/paxg-phase1-data`)
- Tests: 181 en `functions/test` + 11 en `frontend`; `vite build` OK.
- Commits: velas 4h/paginado/15m (B3a, B15) · cliente FRED · régimen GC=F + prima · modo degradado + health profundo + snapshots.
- Nuevos módulos puros y testeables: `candles.js`, `fredService.js`, `spotGold.js`, `dataHealth.js`, `snapshot.js`; jobs: `scheduled/snapshotJob.js`; rutas: `routes/health.js`.
- Requiere: secreto `FRED_API_KEY` (ya cargado) — sin él todo sigue funcionando en modo degradado.
- Comportamiento que cambia: indicadores/zonas/market mode técnico sobre 4h; una compra con degradación severa baja de intensidad; nuevo job horario.
- **No verificado en vivo** (egress bloqueado): ver sección 7 (ítems P1).
- Siguiente: P2 (hecha, ver abajo) → P3.

### P2 — Backtester y recalibración (rama `claude/paxg-phase2-backtest`)
- Tests: 259 en `functions/test` + 11 en `frontend`; `vite build` OK. Nuevos: `backtest.{stats,features,walkforward,dca,run}.test.js`, `p2runtime.test.js`.
- Módulos nuevos (`functions/src/backtest/`): `stats` (ridge, logística, Spearman, permutación, Brier), `timeseries` (rezagos), `indicators`, `features` (19 variables, 3 horizontes), `walkForward`, `candidates` (menú + veredicto), `ruleScore` (réplica diaria del score, reutiliza los mapeos de producción), `dcaSim`, `data` (Yahoo/FRED/Stooq/COT), `run`, `report`; CLI `scripts/backtest.mjs`; workflow `backtest.yml`. Runtime: `previousMode.js`, `decoupling.js`, `atrPercentile`, `parseCotHistory`.
- Hallazgos técnicos del proceso (detalle en `docs/BACKTEST.md`): p-values analíticos optimistas → permutación; sobreajuste del ridge de 19 variables incluso con señal fuerte; sesgo negativo del IC OOS sobre ruido; falsos positivos del placebo de DCA si se baraja por ventana; **fuga real corregida**: las etiquetas a h días de las últimas filas previas al hold-out miraban dentro del hold-out.
- Comportamiento que cambia en producción: histéresis del modo de oro, ATR por percentil en el técnico de oro, `getCOTData` pide 160 semanas (percentil), `getFredMacro` devuelve `history` de la tasa real (se retira antes de cachear), snapshots `p2`.
- No verificado en vivo: el runtime de P2 en Cloud Functions (histéresis con snapshots reales, percentil COT con la API real, `decoupling` con GC=F + FRED API); primer `[Snapshot]` con `modelVersion: p2` y `market.hysteresis` en Firestore.
- Siguiente: P3 (política/cartera/sizing) usando la hipótesis de DCA y el criterio de evidencia de P2.

### P3 (parte 1) — Política de DCA (rama `claude/paxg-phase3-policy`)
- Tests: 274 en `functions/test`. Nuevos: `dcaPolicy.test.js` (mapeo idéntico al evaluado, monotonía, límites, score no finito), casos P3 en `decisionEngine.test.js` (acumula en risk_off, salvaguardas, el tamaño no sigue al score, BTC intacto), registro de política en `decisionLog.test.js`.
- Backtest (run #6 de Actions): variantes de política pre-declaradas — ver `docs/BACKTEST.md`.
- No verificado en vivo: cómo se ve la recomendación de BUY en risk_off en la UI real y la primera decisión guardada con `dcaPolicy`.
