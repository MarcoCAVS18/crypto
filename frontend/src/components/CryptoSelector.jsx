// Selector de criptomoneda — acepta una lista dinámica de símbolos
const CRYPTO_META = {
  BTC:  { label: 'Bitcoin',  colorClass: 'text-orange-400 border-orange-500 bg-orange-500/20', icon: '₿' },
  ETH:  { label: 'Ethereum', colorClass: 'text-blue-400 border-blue-500 bg-blue-500/20',       icon: 'Ξ' },
  PAXG: { label: 'PAX Gold', colorClass: 'text-yellow-400 border-yellow-500 bg-yellow-500/20', icon: 'Au' },
};

const UNSELECTED_CLASS = 'bg-gray-800 border-2 border-gray-700 text-gray-400 hover:border-gray-600';

export function CryptoSelector({ selected, onSelect, cryptos = ['BTC', 'PAXG'] }) {
  return (
    <div className="flex gap-1 sm:gap-2">
      {cryptos.map((id) => {
        const meta = CRYPTO_META[id] ?? { label: id, colorClass: 'text-slate-400 border-slate-500 bg-slate-500/20', icon: id[0] };
        const isSelected = selected === id;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`
              flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-all text-sm sm:text-base
              ${isSelected
                ? `border-2 ${meta.colorClass}`
                : UNSELECTED_CLASS
              }
            `}
          >
            <span className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center font-bold text-xs sm:text-sm">
              {meta.icon}
            </span>
            <span>{id}</span>
          </button>
        );
      })}
    </div>
  );
}

export default CryptoSelector;
