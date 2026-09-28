// Matemática pura del portfolio: costo promedio ponderado con ventas.
//
// Método: costo promedio móvil. Una compra suma unidades y costo; una venta
// retira unidades AL COSTO PROMEDIO VIGENTE (no al precio de venta) y la
// diferencia entre lo cobrado y ese costo es ganancia realizada.
// Antes se usaba (invertido − cobrado) / unidades, que tras una venta parcial
// subestimaba el promedio (y por lo tanto inflaba el P&L y disparaba ventas).

const EPS = 1e-9;

function dateMs(op) {
  const t = new Date(op.date).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {Array<{symbol:string,type:'BUY'|'SELL',units:number,amount_usd:number,fee?:number,date?:string}>} operations
 * @returns {Array<{
 *   symbol:string, operations:number, fees:number,
 *   units:number, invested:number, withdrawn:number,
 *   netInvested:number, costBasis:number, avgBuyPrice:number,
 *   realizedPnl:number, hasPosition:boolean
 * }>}
 */
export function computePortfolioSummary(operations = []) {
  // Orden cronológico; en el mismo día las compras van antes que las ventas.
  const ordered = operations
    .map((op, i) => ({ op, i }))
    .sort((a, b) =>
      dateMs(a.op) - dateMs(b.op) ||
      (a.op.type === 'BUY' ? 0 : 1) - (b.op.type === 'BUY' ? 0 : 1) ||
      a.i - b.i
    )
    .map(x => x.op);

  const bySymbol = new Map();
  for (const op of ordered) {
    let s = bySymbol.get(op.symbol);
    if (!s) {
      s = {
        symbol: op.symbol, operations: 0, fees: 0,
        units: 0, invested: 0, withdrawn: 0, costBasis: 0, realizedPnl: 0
      };
      bySymbol.set(op.symbol, s);
    }
    s.operations += 1;
    s.fees += op.fee || 0;

    const units  = Number(op.units) || 0;
    const amount = Number(op.amount_usd) || 0;

    if (op.type === 'BUY') {
      s.units     += units;
      s.costBasis += amount;
      s.invested  += amount;
    } else if (op.type === 'SELL') {
      const sold     = Math.min(units, s.units);
      const avg      = s.units > EPS ? s.costBasis / s.units : 0;
      const costGone = avg * sold;
      s.units       -= sold;
      s.costBasis   -= costGone;
      s.withdrawn   += amount;
      s.realizedPnl += amount - costGone;
      if (s.units < EPS) { s.units = 0; s.costBasis = 0; }
    }
  }

  return [...bySymbol.values()].map(s => ({
    ...s,
    netInvested: s.invested - s.withdrawn,                       // flujo de caja neto (P&L total)
    avgBuyPrice: s.units > EPS ? s.costBasis / s.units : 0,      // costo promedio de lo que aún tenés
    hasPosition: s.units > EPS
  }));
}
