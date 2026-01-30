// Selector de criptomoneda (BTC/PAXG)
import { Bitcoin } from 'lucide-react';

export function CryptoSelector({ selected, onSelect }) {
  const cryptos = [
    { id: 'BTC', label: 'Bitcoin', color: 'orange' },
    { id: 'PAXG', label: 'PAX Gold', color: 'yellow' }
  ];

  return (
    <div className="flex gap-1 sm:gap-2">
      {cryptos.map((crypto) => (
        <button
          key={crypto.id}
          onClick={() => onSelect(crypto.id)}
          className={`
            flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-all text-sm sm:text-base
            ${selected === crypto.id
              ? `bg-${crypto.color}-500/20 border-2 border-${crypto.color}-500 text-${crypto.color}-400`
              : 'bg-gray-800 border-2 border-gray-700 text-gray-400 hover:border-gray-600'
            }
          `}
        >
          {crypto.id === 'BTC' ? (
            <Bitcoin className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <span className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center text-yellow-500 font-bold text-xs sm:text-sm">Au</span>
          )}
          <span>{crypto.id}</span>
        </button>
      ))}
    </div>
  );
}

export default CryptoSelector;
