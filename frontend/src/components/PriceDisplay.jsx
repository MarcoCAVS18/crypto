// Visualización del precio actual
import { formatPrice, formatPercent } from '../utils/formatters';

export function PriceDisplay({ symbol, price, change24h }) {
  const isPositive = change24h >= 0;

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-2">
      <div className="flex items-baseline gap-1 sm:gap-2">
        <span className="text-lg sm:text-xl text-gray-400 font-medium">{symbol}</span>
        <span className="text-2xl sm:text-4xl font-bold text-white">
          ${formatPrice(price)}
        </span>
      </div>

      {change24h !== undefined && (
        <div className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          <span className="text-sm">24h:</span>
          <span className="font-medium">
            {isPositive ? '+' : ''}{formatPercent(change24h)}
          </span>
        </div>
      )}
    </div>
  );
}

export default PriceDisplay;
