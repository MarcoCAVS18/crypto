// Reporte en markdown de los resultados de runBacktest. Pura y testeada: no decide nada, solo presenta
// con las advertencias que el lector necesita para no sobreinterpretar.

const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pct = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)} %` : '—');

export function renderReport(res, { sources = null, generatedAt = null } = {}) {
  if (res.insufficient) return `# Backtest PAXG/oro\n\n**Datos insuficientes** (${res.rows} filas utilizables). No se puede concluir nada.\n`;
  const { meta } = res;
  const L = [];
  L.push('# Backtest del score de oro — resultados');
  if (generatedAt) L.push(`\n_Generado: ${generatedAt}_`);
  L.push(`\n- Muestra: **${meta.firstDate} → ${meta.lastDate}** (${meta.rows} días de negociación), oro = futuro GC=F (proxy de PAXG).`);
  L.push(`- Hold-out (intocable hasta la evaluación final): **desde ${meta.holdoutStart}** (${meta.holdoutYears} años).`);
  L.push(`- Comparaciones realizadas: **${meta.comparisons}**. Con tantas pruebas, algo sale "significativo" por azar: se exige p < 0.01 y confirmación en el hold-out.`);
  L.push(`- IC = correlación de Spearman entre el score y el retorno futuro; p por test de permutación (${meta.permB} desplazamientos circulares).`);

  if (sources) {
    L.push('\n## Fuentes de datos\n');
    L.push('| Fuente | Estado | Filas | Desde | Hasta |\n|---|---|---|---|---|');
    for (const [k, s] of Object.entries(sources)) L.push(`| ${k} | ${s.ok ? 'ok' : `falló: ${s.error}`} | ${s.n ?? '—'} | ${s.from ?? '—'} | ${s.to ?? '—'} |`);
  }

  L.push('\n## Cobertura de variables\n');
  L.push(Object.entries(meta.coverage).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · '));

  for (const h of meta.horizons) {
    L.push(`\n## Modelos — horizonte ${h} días\n`);
    L.push('| Modelo | IC walk-forward | p | IC hold-out | p hold-out | Veredicto |\n|---|---|---|---|---|---|');
    const rowsH = [...res.models.filter(m => m.horizon === h), ...res.baseline.filter(b => b.horizon === h)];
    for (const m of rowsH) {
      const o = m.oos ?? {}, ho = m.holdout ?? {};
      L.push(`| ${m.label} | ${f(o.ic)} | ${f(o.icPermP)} | ${ho.insufficient ? 'n/d' : f(ho.ic)} | ${ho.insufficient ? '—' : f(ho.icPermP)} | ${m.verdict} |`);
    }
    const ics = res.featureICs[h];
    const top = Object.entries(ics).filter(([, v]) => Number.isFinite(v.ic)).sort((a, b) => Math.abs(b[1].ic) - Math.abs(a[1].ic)).slice(0, 6);
    L.push(`\nIC univariado (solo datos previos al hold-out), 6 mayores: ${top.map(([k, v]) => `${k} ${f(v.ic, 2)} (p ${f(v.pValue, 3)})`).join(' · ')}`);
  }

  L.push('\n## DCA: ¿modular el monto abarata el costo promedio?\n');
  L.push('Gasto igualado al DCA fijo; ventanas móviles de ~2 años. `Ratio` = costo promedio modulado / fijo (< 1 = compró más barato). El placebo desplaza la señal contra los precios.\n');
  L.push('| Estrategia | Ventanas | Ratio medio | Gana en | Ventaja | p vs. placebo |\n|---|---|---|---|---|---|');
  for (const d of res.dca) {
    L.push(d.insufficient ? `| ${d.label} | ${d.windows} | datos insuficientes | | | |`
      : `| ${d.label} | ${d.windows} | ${f(d.meanRatio, 4)} | ${pct(d.winRate, 0)} | ${f(d.avgAdvantagePct, 2)} % | ${f(d.pValue, 3)} |`);
  }

  if (res.dcaHoldout?.length) {
    L.push(`\n### DCA en el hold-out (desde ${meta.holdoutStart}, ventanas de ~6 meses)\n`);
    L.push('| Estrategia | Ventanas | Ratio medio | Gana en | Ventaja | p vs. placebo |\n|---|---|---|---|---|---|');
    for (const d of res.dcaHoldout) {
      L.push(d.insufficient ? `| ${d.label} | ${d.windows} | datos insuficientes | | | |`
        : `| ${d.label} | ${d.windows} | ${f(d.meanRatio, 4)} | ${pct(d.winRate, 0)} | ${f(d.avgAdvantagePct, 2)} % | ${f(d.pValue, 3)} |`);
    }
  }

  if (res.extension?.variants?.length) {
    const ex = res.extension;
    L.push('\n## Fase 6 — ¿sumar insumos al score? (variantes pre-declaradas)\n');
    L.push('Score actual + componente(s) con signo a priori y peso fijo ±0.10. **Regla de decisión (docs/BACKTEST.md):** entra al score solo con p < 0.01 y signo igual en el hold-out (IC), o mejor costo de DCA que la política actual en ambos tramos con p < 0.01. `ΔIC` = IC de la variante − IC del score actual (sin test propio).\n');
    L.push('| Variante | Horizonte | IC walk-forward | p | ΔIC | IC hold-out | p hold-out | Veredicto |\n|---|---|---|---|---|---|---|---|');
    for (const v of ex.variants) {
      if (v.insufficient) { L.push(`| ${v.label} | — | datos insuficientes (cobertura ${Math.round(v.coverage * 100)} %) | | | | | |`); continue; }
      const o = v.oos ?? {}, ho = v.holdout ?? {};
      L.push(`| ${v.label} | ${v.horizon} d | ${f(o.ic)} | ${f(o.icPermP)} | ${f(v.dIC)} | ${ho.insufficient ? 'n/d' : f(ho.ic)} | ${ho.insufficient ? '—' : f(ho.icPermP)} | ${v.verdict} |`);
    }
    for (const [h, ics] of Object.entries(ex.extraICs ?? {})) {
      L.push(`\nIC univariado de managed money (percentil 3 años, solo datos previos al hold-out), ${h} d: ${Object.entries(ics).map(([k, v]) => `${k} ${f(v.ic, 3)} (n ${v.n}, p ${f(v.pValue, 3)})`).join(' · ')}`);
    }
    L.push('\n### DCA con la política desplegada (inclinación contrarian ×0.5–1.5) usando cada variante\n');
    L.push('| Variante | Tramo | Ventanas | Ratio medio | Gana en | Ventaja | p vs. placebo |\n|---|---|---|---|---|---|---|');
    const pol = res.dca?.find(d => d.id === 'policy_score'), polH = res.dcaHoldout?.find(d => d.id === 'policy_score');
    const rowD = (label, tramo, d) => (d.insufficient ? `| ${label} | ${tramo} | ${d.windows} | datos insuficientes | | | |`
      : `| ${label} | ${tramo} | ${d.windows} | ${f(d.meanRatio, 4)} | ${pct(d.winRate, 0)} | ${f(d.avgAdvantagePct, 2)} % | ${f(d.pValue, 3)} |`);
    if (pol) L.push(rowD('**Referencia: política actual**', 'hasta hold-out', pol));
    if (polH) L.push(rowD('**Referencia: política actual**', 'hold-out', polH));
    ex.dca.forEach((d, k) => { L.push(rowD(d.label, 'hasta hold-out', d)); if (ex.dcaHoldout[k]) L.push(rowD(d.label, 'hold-out', ex.dcaHoldout[k])); });
  }

  L.push('\n## Cómo leer esto (límites)\n');
  L.push('- "Sin evidencia" **no** significa "no hay señal": con etiquetas solapadas y pocos años de OOS la potencia es baja (medido en datos sintéticos).');
  L.push('- Las ventanas de DCA se solapan mucho: las muestras independientes son bastante menos que "Ventanas".');
  L.push('- El test de placebo del DCA es levemente liberal con señales persistentes (~12 % de falsos positivos a 0.05 en simulación): usar p < 0.01.');
  L.push('- El score real incluye IA y velas 4h, que no tienen historia: la réplica es una aproximación (ver cabecera de `ruleScore.js`).');
  L.push('- Resultados pasados no garantizan resultados futuros; el objetivo es calibrar y *descartar* reglas sin respaldo, no fabricar certeza.');
  return L.join('\n') + '\n';
}
