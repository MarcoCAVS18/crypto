// Mapa visual de zonas de precio (compra/neutral/venta)
import { formatPrice } from '../utils/formatters';

export function ZoneMap({ zones, currentPrice }) {
  // Calcular posición relativa del precio actual
  const totalRange = zones.sell.max - zones.buy.min;
  const pricePosition = ((currentPrice - zones.buy.min) / totalRange) * 100;
  const clampedPosition = Math.max(0, Math.min(100, pricePosition));

  // Calcular anchos proporcionales de cada zona
  const buyWidth = ((zones.buy.max - zones.buy.min) / totalRange) * 100;
  const neutralWidth = ((zones.neutral.max - zones.neutral.min) / totalRange) * 100;
  const sellWidth = ((zones.sell.max - zones.sell.min) / totalRange) * 100;

  return (
    <div className="w-full">
      <div className="mb-4 text-center">
        <span className="text-sm text-gray-400">Zona actual: </span>
        <span className={`font-semibold ${getZoneColor(zones.currentZone)}`}>
          {getZoneLabel(zones.currentZone)}
        </span>
      </div>

      {/* Barra de zonas */}
      <div className="relative h-12 rounded-lg overflow-hidden flex mb-2">
        {/* Zona de compra */}
        <div
          className="bg-green-500/40 border-r border-gray-700 flex items-center justify-center"
          style={{ width: `${buyWidth}%` }}
        >
          <span className="text-xs text-green-300 font-medium">COMPRA</span>
        </div>

        {/* Zona neutral */}
        <div
          className="bg-yellow-500/40 border-r border-gray-700 flex items-center justify-center"
          style={{ width: `${neutralWidth}%` }}
        >
          <span className="text-xs text-yellow-300 font-medium">NEUTRAL</span>
        </div>

        {/* Zona de venta */}
        <div
          className="bg-red-500/40 flex items-center justify-center"
          style={{ width: `${sellWidth}%` }}
        >
          <span className="text-xs text-red-300 font-medium">VENTA</span>
        </div>

        {/* Marcador del precio actual */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-lg shadow-white/50"
          style={{ left: `${clampedPosition}%`, transform: 'translateX(-50%)' }}
        >
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="bg-white text-gray-900 px-2 py-1 rounded text-xs font-bold">
              ${formatPrice(currentPrice)}
            </span>
          </div>
        </div>
      </div>

      {/* Labels de precios */}
      <div className="flex justify-between text-[10px] sm:text-xs text-gray-500 px-1">
        <span>${formatPrice(zones.buy.min)}</span>
        <span className="hidden sm:inline">${formatPrice(zones.buy.max)}</span>
        <span className="hidden sm:inline">${formatPrice(zones.sell.min)}</span>
        <span>${formatPrice(zones.sell.max)}</span>
      </div>

      {/* Razones de las zonas */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs">
        <div className="text-green-400">
          <span className="font-medium">Zona compra: </span>
          <span className="text-gray-400">{zones.buy.reason}</span>
        </div>
        <div className="text-red-400">
          <span className="font-medium">Zona venta: </span>
          <span className="text-gray-400">{zones.sell.reason}</span>
        </div>
      </div>
    </div>
  );
}

function getZoneColor(zone) {
  switch (zone) {
    case 'buy': return 'text-green-400';
    case 'sell': return 'text-red-400';
    default: return 'text-yellow-400';
  }
}

function getZoneLabel(zone) {
  switch (zone) {
    case 'buy': return 'Zona de Compra';
    case 'sell': return 'Zona de Venta';
    default: return 'Zona Neutral';
  }
}

export default ZoneMap;
