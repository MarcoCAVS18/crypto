# Auditoría PAXG — mapa, hallazgos y hoja de ruta

> **Documento vivo.** Leelo ANTES de tocar la lógica de PAXG: evita releer todo el código.
> Verificado contra `main` @ `56a7baf` (2026-09-28). Al cerrar cada fase, actualizá la sección 5 (estado) y la tabla 3.
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
Coinbase PAXG-USD (velas 1h, 250 ≈ 10 días)        functions/src/services/marketData.js
  → indicadores (EMA/RSI/ATR/VWAP/swings)           services/technicalAnalysis.js
  → zonas buy/neutral/sell                          services/zoneCalculator.js
  → market mode técnico (score entero)              services/marketMode.js
Yahoo (DXY, ^TNX, ^GVZ, SI=F) + FRED DFII10 + CFTC COT + RSS  services/macroService.js, newsService.js
  → Groq: sentimiento −1..1 (+ traducción)           services/groqAnalyzer.js
  → contexto de oro (caché Firestore 2h)             services/goldContext.js
  → market mode de oro (score −1..1, umbral ±0.25)   services/goldMarketMode.js
  → motor de reglas BUY/WAIT/SELL + tramos           services/decisionEngine.js
  → modulación por calendario (Groq) + insight (Groq) routes/crypto.js  (POST /api/crypto/decision)
  → guarda historial                                 config/database.js (Firestore `decisions`)
UI: frontend/src (App.jsx, store/appStore.js, components/DecisionPanel|MacroContext|MarketHero|…)
Push: scheduled/zoneWatcher.js (cada 60 min) + services/pushService.js
```

Pesos del score de oro (`goldMarketMode.js`): IA 40 %, DXY 25 %, 10Y 20 %, técnico 15 %; aditivos COT ±0.10, tasa real ±0.10, GVZ ±0.08, oro/plata ±0.07, tendencia diaria ±0.10 (hasta ±0.15). Modo: `> 0.25` risk_on, `< −0.25` risk_off. Suma de máximos = 1.5 (se recorta a ±1).

Motor (`decisionEngine.js`): gates (cash<10 → WAIT; risk_off → WAIT; observación → WAIT) → `decideInversionMode` (P&L vs promedio, zonas, umbrales PAXG venta 30 %/45 %, fracción de capital por score/COT/tasa real/GVZ/tendencia diaria) o `decideTradingMode` (**no accesible desde la UI**: `UserStateInput` solo ofrece inversión y observación).

Frontend: `appStore.getDecision()` arma `portfolioContext` (promedio, `executedBuys` de los últimos 4 días) y llama a `POST /api/crypto/decision`. `loadCryptoData` repite la decisión cada 5 min mientras la app esté abierta (`AUTO_REFRESH_INTERVAL`).

Perfiles (`frontend/src/data/profiles.js`): marco, tomas, victor. Auth = PIN en Firestore (`firestoreAuth.js`).

## 2. Datos externos y sus particularidades

| Fuente | Uso | Particularidad |
|---|---|---|
| Coinbase Exchange `/candles` | velas | Granularidades soportadas (por confirmar): 60, 300, 900, 3600, 21600, 86400. **4h (14400) no existe** → ver B15. Devuelve la vela en curso (por confirmar). Máx 300 velas/request. |
| Yahoo `v8/finance/chart` | DXY, ^TNX, ^GVZ, SI=F | Endpoint no oficial. `changePercent` se calculaba con `chartPreviousClose` (ver B12). |
| FRED `fredgraph.csv?id=DFII10` | tasa real 10Y | CSV; faltante = `.` (viejo) o vacío (nuevo). Ver B2. |
| CFTC Socrata `6dca-aqww` | COT (legacy, no-comercial) | Umbrales absolutos 200k/80k/0 sin normalizar por open interest (D3). |
| RSS (Google News ×2, Kitco, Yahoo GLD) | titulares | Sin dedupe semántico ni ponderación por fuente. |
| Groq `openai/gpt-oss-120b` | sentimiento, traducción, calendario, insight, chat, futuros | Modelo de **razonamiento**: el razonamiento gasta el presupuesto de `max_tokens` (B11). Params documentados: `reasoning_effort` low/medium/high, `include_reasoning`. |

## 3. Registro de hallazgos

Estado: ⬜ pendiente · 🟡 en PR · ✅ hecho. Fase = dónde se arregla.

### Críticos (deciden mal)

| ID | Hallazgo | Dónde | Evidencia | Fase | Estado |
|---|---|---|---|---|---|
| B1 | **Costo promedio roto tras ventas**: `(invertido − cobrado)/unidades`. 1u@4000 y vender 0.3u@4800 → app promedio $3.657, P&L +31 % (real +20 %) → cruza el umbral de venta 30 % de PAXG. Vender la mitad a 8000 → promedio $0 → `hasPosition=false`. | `frontend/src/store/appStore.js:28-36` | Reproducido copiando la fórmula literal | P0 | ⬜ |
| B2 | **Tasa real (FRED) nunca se lee**: el filtro `!valor.includes('.')` descarta todos los decimales; con CSV nuevo (vacío) o viejo (`.`) lanza error. Señal apagada en silencio (score, fracción de capital, override neutral, prompt IA). | `functions/src/services/macroService.js:193` | Probado con ambos formatos sobre el filtro literal | P0 | ⬜ |
| B3 | **Indicadores sobre datos equivocados**: (a) `timeframe='4h'` se ignora, todo corre sobre 250 velas de 1h ≈ 10 días (la "EMA200" es de ~8 días); (b) la vela en formación entra a RSI/ATR/volumen: primeros ~24 min de cada hora dan volumen "muy bajo" (−1 al score) — asume que Coinbase la devuelve; (c) si Coinbase falla se usan velas sintéticas con `Math.random()` y el motor igual decide; (d) ATR% de PAXG en 1h ≈ 0,2 % → `<1.5 %` da +1 casi siempre y las ramas 3 %/5 % son código muerto; (e) VWAP acumulado desde hace 10 días. | `routes/crypto.js:83,175`, `marketData.js:45-48`, `technicalAnalysis.js:138`, `marketMode.js:29-41` | Simulación con volatilidad de oro (ATR% mediano 0,228 %; 100 % de ventanas < 1,5 %); Exp. 8 de volumen | P0 (a-parcial: cerrar vela, gate sintéticas, VWAP) / P1 (timeframes reales) / P2 (umbrales ATR calibrados) | ⬜ |
| B4 | **Calendario macro**: el evento desaparece a las 00:00 UTC del mismo día (FOMC es 14:00 ET); `daysUntil` nunca es 0; 2 de 8 fechas contrastadas estaban mal (FOMC junio 10 vs 16–17; CPI sept 10 vs 11); termina 2026-12-18; 3 copias (backend, functions, frontend). | `functions/src/data/macroCalendar.js:60-75`, `frontend/src/data/macroCalendar.js` | Exp. 7 + contraste con federalreserve.gov y bls.gov | P0 | ⬜ |
| B5 | **Sin salida de riesgo**: cash < 10 % bloquea también las VENTAS; risk_off nunca recorta. Con +50 %, RSI 78, zona de venta: cash 5 % → WAIT "sin cash"; risk_off → WAIT. | `decisionEngine.js:18,29` | Exp. 5 (gates) | P0 (mínimo) / P3 (salidas por régimen) | ⬜ |
| B6 | **Score macro poco confiable**: la IA ya recibe DXY/10Y/COT/tasa real y luego se re-suman (doble conteo); COT/tasa real/GVZ/tendencia diaria se reusan en la fracción de capital y en el override neutral; la IA sola cambia el modo con \|score\| ≥ 0,63; escalones (DXY +0,149 %→+0,151 % mueve el score −0,125); sin histéresis. | `goldMarketMode.js:45-232`, `groqAnalyzer.js:24-96` | Exp. 4 (barrido de sensibilidad) | P0 (doble conteo, tope IA, continuidad) / P2 (histéresis, z-scores) | ⬜ |

### Importantes

| ID | Hallazgo | Dónde | Evidencia | Fase | Estado |
|---|---|---|---|---|---|
| B7 | **Zonas inestables**: banda ±ATR horario (~0,2 %) pero relleno fijo ±2 % sobre el último swing → la zona depende del último extremo de ~10 días. En simulación cambia en ~23 % de las horas (dura ~4,4 h). El "R/R estimado" nunca supera 0,33 (artefacto de 0,5/1,5×ATR). En la ruta DCA el tramo 3 "mínimo de zona" queda a −0,3 % (encima del tramo 2 a −1,5 %) con 40 % del monto. | `zoneCalculator.js:45-100`, `decisionEngine.js:108-124,465` | Exp. 1-3 (sintético; propiedades estructurales, frecuencias ilustrativas) | P0 (tramos, R/R) / P2 (zonas) | ⬜ |
| B8 | Mensaje PAXG usa 25 % en vez de 30 %: dice "subir −1,0 % adicional". | `decisionEngine.js:300-308` | Exp. 4 | P0 | ⬜ |
| B9 | **`zoneWatcher` desplegado y roto**: importa `fetchMarketData` (no existe) y pasa `symbol` como 3er arg de `calculateZones`. Nunca salió un push. Además la zona flipea (B7) → habría spam. | `scheduled/zoneWatcher.js:17,25,30`, `index.js:27` | Reproducido (TypeError ×2) | P0 | ⬜ |
| B10 | **Historial no medible**: se guarda una decisión cada 5 min por pestaña abierta; `getDecisionsBySymbol` sin `orderBy` → subconjunto arbitrario (orden por ID auto); no se guardan features/horizonte; "AI Signal History" solo cuenta BUY/WAIT/SELL; `savedToHistory` siempre `false`. | `config/database.js:18,41`, `routes/crypto.js:290-308`, `BacktestStats.jsx` | Lectura + semántica documentada de Firestore | P0 (dedupe/orden) / P1 (snapshots) / P4 (métricas) | ⬜ |
| B11 | **Capa de IA**: fallos cacheados 2 h; sin `reasoning_effort` (gpt-oss razona y gasta `max_tokens`); prompt del insight sesgado ("destacá la consistencia"); outcome ✓/✗ por signo del precio sin importar BUY/SELL/WAIT; `optimalEntryPrice` inventado por el LLM se muestra como "Entrada sugerida"; clave de caché del insight usa buckets de $500 (pensados para BTC); el chat no recibe motivo/razones y espera `pnlPercent`/`currentValue` que nunca se envían. | `goldContext.js:123`, `groqAnalyzer.js:255-316`, `routes/crypto.js:262-264`, `FloatingChat.jsx:7-18` | Lectura + búsqueda de docs Groq | P0 | ⬜ |
| B12 | **Yahoo "% hoy" probablemente es cambio de 5 días**: con `range=5d`, `chartPreviousClose` suele ser el cierre previo a la ventana. | `macroService.js:57` | **NO verificado** (egress bloqueado). Arreglo robusto: usar los 2 últimos cierres | P0 | ⬜ |

### Otros

| ID | Hallazgo | Fase | Estado |
|---|---|---|---|
| B13 | **Seguridad**: `firestore.rules` con `if true` en `portfolio_operations` y `user_profiles` (hash SHA-256 de PIN legible, fuerza bruta trivial); `/api/chat` y `/api/gold-context/refresh` sin auth ni rate-limit (queman la cuota de Groq); CORS `origin: true`. | P5 | ⬜ |
| B14 | Deuda: dos backends duplicados; modo trading inalcanzable; `evaluateSignalStrength`, `getModeDescription`, `calculateDistanceToZones`, `multiTimeframeData` sin uso; README desactualizado (CoinGecko/SQLite); **sin tests**. | P0 (tests) / P5 | ⬜ |
| B15 | **Velas de gráfico**: `granularity=15m` no está en `granMap` y cae a diario (el gráfico "1D" muestra 96 velas diarias); `4h` (14400) no lo soporta Coinbase (por confirmar) → falla el gráfico "1M". | `routes/crypto.js:56-60`, `MarketHero.jsx:34-37` | P1 | ⬜ |

### Debilidades de diseño (no bugs)

- **D1** Cada señal entra 2–3 veces (score, fracción de capital, override neutral).
- **D2** Umbrales de nivel absolutos (10Y 3.5/4.0/4.25/4.75; oro/plata 70/80/90; GVZ 15/20/25; tasa real 0/1/2) sin z-score ni cambio; dependen del régimen.
- **D3** COT: `contrarian_bull` exige net ≤ 0 (prácticamente inalcanzable hoy); `crowded_long` (>200k) pelea contra la tendencia en mercados alcistas; sin normalizar por open interest.
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

### P0 — Correcciones + tests (esta fase)  → PR: _ver historial_
- [ ] Infra de tests (`node --test`) + CI de PR
- [ ] B1 costo promedio ponderado (`portfolioMath.js`) + uso en motor/insight/preview DCA
- [ ] B2 parser FRED · B12 cambio diario Yahoo con 2 últimos cierres
- [ ] B3 (parcial): descartar vela en curso, volumen sin la vela actual, VWAP 24 velas, gate de velas sintéticas
- [ ] B4 calendario con hora ET, mismo día, fechas corregidas, cobertura, endpoint único `/api/calendar`
- [ ] B5 cash bajo no bloquea SELL; risk_off permite recorte si hay ganancia + zona de venta
- [ ] B6 sin macro en el prompt de IA, tope ±0.15 a la IA, mapeos continuos, razón explícita si IA falla
- [ ] B7 tramos estrictamente descendentes; R/R solo con niveles estructurales · B8 mensaje 30 %
- [ ] B9 `zoneWatcher` funcional + antispam (2 lecturas + cooldown)
- [ ] B10 dedupe por hora + lectura ordenada sin índice compuesto + snapshot básico
- [ ] B11 helper único de Groq (`reasoning_effort`, presupuesto, reintento), TTL corto de fallos, prompt/outcome/insight/cache/chat corregidos

### P1 — Fundamentos de datos
- [ ] FRED API (DFII10, DGS10, DGS2, T10YIE, dólar amplio, VIXCLS, GVZCLS) con historia y frescura por insumo
- [ ] Oro spot (GC=F/XAU) para tendencia/backtest; prima/descuento de PAXG
- [ ] Velas: agregado 1h→4h, paginado >300, `15m`, solo velas cerradas; timeframe real (4h táctico, 1d régimen) — B3a, B15
- [ ] Snapshot programado por evaluación (features, versión, acción, monto) en Firestore
- [ ] Modo degradado explícito + health profundo (`/api/health`) con frescura por fuente

### P2 — Backtester y recalibración
- [ ] Backtester point-in-time (GC=F + FRED + COT + GVZ) vs DCA fijo y buy&hold; walk-forward con hold-out
- [ ] Features normalizadas (z-score/percentiles), monitor de desacople gold–tasa real, histéresis, ATR relativo a la historia
- [ ] Ponderaciones estimadas (ridge/logística) → P(sube 20d), retorno esperado, dispersión

### P3 — Política, cartera y LLM
- [ ] Peso objetivo del sleeve de oro + bandas; DCA de monto variable; tamaño por volatilidad (Kelly fraccional acotado); escalones por cuantiles de retrocesos
- [ ] Salidas por rotura de tendencia + macro adverso; recorte por sobre-extensión; costos (comisión + spread)
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
- Fees no se incluyen en el costo base (mismo criterio que antes); revisar en P3 con el modelo de costos.
- Firestore: `deploy.yml` no despliega índices; por eso el historial se lee por rango de ID de documento (sin índice compuesto).

## 7. Verificación

**Cómo se verificó** (con el código real del repo sobre series sintéticas de volatilidad de oro ≈ 0,17 %/h y fixtures; egress a Coinbase/Yahoo/FRED/Groq bloqueado en la sesión de auditoría):

- Zonas/ATR/R-R/tramos: ATR% mediano 0,228 %; "volatilidad controlada" en 100 % de ventanas; R/R máx 0,33; zona cambia ~22,7 %/h (duración media 4,4 h); acción BUY↔WAIT cambia ~15 %/h. Las *propiedades* son estructurales; los *porcentajes* son ilustrativos.
- Sensibilidad del score: IA sola cambia el modo con |score| ≥ 0,63; escalón DXY = −0,125.
- Calendario: FOMC (2026-09-16) visible hasta 23:59 UTC del día previo y **no** a partir de 00:01 UTC del día del evento; 11 eventos restantes desde 2026-09-28.
- Costo promedio, FRED y gates: ver filas B1, B2, B5.

**No verificado (confirmar con un comando):**

- Yahoo `chartPreviousClose` (B12):
  `curl -s -A Mozilla/5.0 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d' | jq '.chart.result[0].meta.chartPreviousClose, .chart.result[0].indicators.quote[0].close'`
- Vela en curso de Coinbase (B3b): el último elemento de `/candles?granularity=3600` ¿tiene `time` = hora actual?
- Formato vigente del CSV de FRED: `curl -s 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10' | tail -3` (el parser nuevo acepta ambos).
- Truncamiento de gpt-oss por presupuesto de tokens (B11): revisar `choices[0].finish_reason === 'length'` y `usage`.
- Granularidades de Coinbase (B15).

## 8. Fechas de calendario contrastadas (fuente oficial)

FOMC 2026 (fed): 27–28 ene, 17–18 mar, 28–29 abr, **16–17 jun**, 28–29 jul, 15–16 sep, 27–28 oct, 8–9 dic (decisión 14:00 ET del 2.º día).
BLS: Empleo ago-2026 → vie 4 sep · CPI ago-2026 → **vie 11 sep** · Empleo sep-2026 → vie 2 oct. Las fechas de CPI/PCE/NFP posteriores figuran en el calendario con `verified: false` hasta contrastarlas.
