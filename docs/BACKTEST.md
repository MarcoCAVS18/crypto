# Backtester del score de oro

Código en `functions/src/backtest/`. Objetivo: **medir** si el score de oro y los modelos candidatos predicen algo, y *descartar* lo que no tenga respaldo. No busca fabricar una ventaja.

## Cómo correrlo

- Con historia real, **solo en GitHub Actions** (el sandbox de desarrollo no tiene red): Actions → *Backtest* → *Run workflow* (o push a la rama de la fase). Reporte en el resumen del job y en el artefacto `backtest-report` (`report.md` + `results.json`). Sin secretos: todas las fuentes son públicas.
- Local (con red): `cd functions && node scripts/backtest.mjs --holdout-years 2 --perm 500` (caché en `.backtest-cache/`, salida en `backtest-out/`, ambos gitignored).
- Tests con datos sintéticos: `npm test` (`backtest.*.test.js`, `helpers/synth.js`).

## Fuentes

| Dato | Fuente | Nota |
|---|---|---|
| Oro, plata, DXY | Yahoo `GC=F`, `SI=F`, `DX-Y.NYB` (fechas explícitas desde 2000) | GC=F es futuro continuo: proxy de PAXG (PAXG existe desde 2019, historia insuficiente). `range=max` degrada a ~270 filas: no usarlo. Stooq (respaldo) devuelve 403 desde Actions. |
| Tasa real, 10Y, 2Y, breakeven, dólar amplio, VIX, GVZ | FRED CSV público (`fredgraph.csv`) | Mismas series que producción. |
| COT | CFTC Socrata `6dca-aqww` (oro COMEX) | Historia desde 1986. |

## Reglas anti-sobreajuste (todas testeadas)

1. **Point-in-time**: rezago de publicación por serie (`timeseries.js`: oro 0 d, FRED 1 d, dólar amplio 7 d, COT 4 d). Test de propiedad: alterar todo dato posterior a D no cambia ninguna feature en D.
2. **Embargo por fecha de etiqueta**: una fila entra al entrenamiento solo si su retorno futuro terminó antes de la primera fecha a predecir.
3. **Hold-out intocable** (últimos 2 años): ni el walk-forward, ni las features univariadas, ni sus *etiquetas* lo tocan (se encontró y corrigió una fuga: las etiquetas a 20/60 días de las últimas filas previas miraban dentro del hold-out; hay test que perturba el hold-out y exige resultados idénticos).
4. **Menú de modelos pre-declarado** (`candidates.js`) y **conteo de comparaciones** en el reporte (54 en la corrida real).
5. **Significancia por permutación** (desplazamiento circular), no fórmulas con n/h. Veredicto estricto: p < 0.01 **y** hold-out coherente.
6. Winsorización con cuantiles del entrenamiento; walk-forward expansivo reentrenado ~trimestralmente.

## Lecciones medidas sobre ruido (datos sintéticos)

- Series persistentes producen ICs de ±0.2–0.3 **por azar** con ~7 años de OOS. Un IC de 0.2 no es evidencia.
- La fórmula analítica del p-value (n/h) era optimista; se reemplazó por permutación. Aun así con señales persistentes es algo liberal: por eso p < 0.01.
- Un ridge con las 19 variables sobreajusta ruido incluso con una señal fuerte plantada; el modelo parsimonioso con la variable correcta sí la detecta, pero la **potencia es limitada** (p < 0.05 en 3 de 4 series). "Sin evidencia" ≠ "no hay señal".
- Sobre ruido, el IC OOS tiende a ser levemente **negativo** (ajuste de regresores persistentes), nunca positivo: un sesgo positivo sería fuga de futuro.
- Placebo del DCA: barajar cada ventana por separado daba falsos positivos; el placebo válido desplaza toda la señal contra los precios (aun así ~12 % de FP a 0.05 con señales persistentes).

## Resultados con datos reales (2001-09 → 2026-09, 6284 días; hold-out desde 2024-09-27)

Corrida en Actions, run #4 (`af70804`); 54 comparaciones.

**Ningún modelo candidato predice el retorno del oro a 20 ni a 60 días fuera de muestra.** Los ICs walk-forward son 0.04 (compuesto a priori), −0.19/−0.26 (ridge macro, negativo: sobreajuste que se revierte), 0.01/−0.08 (tendencia), −0.16/−0.21 (19 variables) y −0.06/−0.14 (logística); ninguno con p < 0.01. Los hold-outs contradicen a los walk-forward (p. ej. ridge 19 variables a 60 d: WF −0.21, hold-out +0.55 con p = 0.002 sobre 2 años de datos altamente solapados): ruido, veredicto "sin evidencia".

**El score actual (réplica diaria, sin IA)** tiene IC −0.10 (p 0.04) a 20 d y −0.13 (p 0.03) a 60 d en el walk-forward y −0.04 / −0.13 en el hold-out (no significativos): **no hay evidencia de que prediga; si algo, el signo es levemente contrario**. Con 54 comparaciones un p ≈ 0.03 no se distingue del azar.

Features univariadas (solo datos previos al hold-out): las mayores son `curve_z` (IC 0.08–0.14, p 0.05–0.09) y `be_chg20` (−0.11, p 0.05) a 60 d; ninguna cruza p < 0.01.

**DCA (gasto igualado, ventanas de ~2 años):**

| Estrategia | Ratio costo prom. vs DCA fijo | Gana en | p vs placebo |
|---|---|---|---|
| Score actual: comprar **más** con score alto | 1.0048 (0.5 % más caro) | 10 % de ventanas | 1.000 |
| Score actual: comprar **más** con score bajo (contrarian) | 0.9920 (0.8 % más barato) | 91 % | 0.003 |
| Compuesto a priori (OOS): más con score alto | 1.0133 (1.3 % más caro) | 8 % | 1.000 |
| Compuesto a priori (OOS): más con score bajo | 0.9896 (1.0 % más barato) | 92 % | 0.003 |

Lectura: **reducir compras cuando el score es bajo (lo que hace hoy la lógica risk_off/gates) encareció el costo promedio** frente a un DCA fijo; **comprar más cuando el score es bajo (dips) lo abarató ~1 %**. El efecto es chico, las ventanas se solapan mucho (≈12 muestras independientes en 25 años) y el placebo es algo liberal; se trata como *hipótesis para P3*, no como regla probada. **Confirmación en el hold-out** (2024-09 → 2026-09, ventanas de ~6 meses, 38 ventanas, run #5 `db70d3c`): "más con score alto" 1.0050 (0 % de ventanas ganadoras); "más con score bajo" 0.9953 (0.47 % más barato, 100 % de ventanas, p 0.003). Misma dirección que antes del hold-out, con magnitud menor y muy pocas ventanas independientes (~4 en 2 años).

## Fase 3 — variantes de política de DCA (run #6, `fd81239`)

Pre-declaradas antes de correr; 8 comparaciones más (4 variantes × pre-hold-out y hold-out). Ratio de costo promedio vs DCA fijo con gasto igualado:

| Variante | 2001–2024 (ventanas 2 años) | Hold-out (ventanas 6 meses) | Lectura |
|---|---|---|---|
| **Score actual, más con score bajo (k 0.5, ×0.5–1.5)** — *la política desplegada* | 0.9966 (−0.34 %), 90 % de ventanas, p 0.003 | 0.9976 (−0.24 %), 100 %, p 0.003 | consistente, efecto chico |
| Caída desde el máximo de 1 año, más cuando cae | 0.9925 (−0.75 %), p 0.003 | 0.9965 (−0.35 %), p 0.346 | no se confirma en hold-out → no se usa |
| Volatilidad realizada alta → más | 1.0001, p 0.86 | 1.0007 | sin efecto |
| Volatilidad realizada alta → menos | 0.9999, p 0.16 | 0.9992 (p 0.003, −0.08 %) | efecto despreciable → no se usa |

Conclusión: el único efecto consistente es *no seguir al score* (comprar más cuando es bajo); el mapeo acotado conserva ~la mitad del efecto del mapeo amplio (×0.25–×2: −0.80 %) con menos riesgo. El efecto (~0.3 %) equivale a ~3 comisiones de Binance spot (0.1 %) y es menor que una comisión de un exchange minorista (~0.5 %): con Binance el costo del DCA no se come el beneficio, pero conviene no multiplicar operaciones (por eso los tramos < $10 se descartan).

## Límites conocidos

- GC=F ≠ PAXG (base de futuros, sesión de negociación distinta); el ratio oro/plata usa futuros.
- La réplica no incluye IA ni velas 4h (sin historia) ni la histéresis; el ATR de producción por percentil no es replicable.
- Un solo activo, un solo ciclo macro dominante (oro 2001-2011 y 2024-26 en tendencia fuerte): cualquier conclusión está condicionada a ese régimen.
- No se modelan costos (comisión + spread) todavía (P3).
