// Prepara velas del API para lightweight-charts. La librería exige tiempos (segundos) estrictamente
// crecientes y valores finitos: una sola vela repetida, desordenada o con NaN rompe el render de TODO el
// gráfico (queda la serie anterior o vacía sin mensaje).

/** @param {Array<{timestamp?:number,time?:number,open:number,high:number,low:number,close:number}>} raw */
export function toChartCandles(raw) {
  const byTime = new Map();
  for (const c of Array.isArray(raw) ? raw : []) {
    const ms = c?.timestamp ?? c?.time;
    const time = Math.floor(Number(ms) / 1000);
    const { open, high, low, close } = c ?? {};
    if (![time, open, high, low, close].every(Number.isFinite)) continue;
    byTime.set(time, { time, open, high, low, close });     // la última con el mismo tiempo gana
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
