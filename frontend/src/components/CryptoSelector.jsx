import { TrendingUp } from 'lucide-react';

const CRYPTO_META = {
  BTC:     { tab: 'BTC',  icon: null,        iconText: '₿',  active: 'text-orange-300 border-orange-500/60 bg-orange-500/15 shadow-orange-500/15' },
  ETH:     { tab: 'ETH',  icon: null,        iconText: 'Ξ',  active: 'text-blue-300  border-blue-500/60  bg-blue-500/15  shadow-blue-500/15'  },
  PAXG:    { tab: 'PAXG', icon: null,        iconText: 'Au', active: 'text-yellow-300 border-yellow-500/60 bg-yellow-500/15 shadow-yellow-500/15' },
  XAUUSDT: { tab: 'XAUT', icon: TrendingUp,  iconText: null, active: 'text-amber-300 border-amber-500/60 bg-amber-500/15 shadow-amber-500/15' },
};

const INACTIVE = 'text-slate-500 border-white/[0.07] bg-slate-800/40 hover:border-white/[0.14] hover:text-slate-300';

export function CryptoSelector({ selected, onSelect, cryptos = ['BTC', 'PAXG'] }) {
  return (
    <div className="flex gap-1.5">
      {cryptos.map((id) => {
        const meta     = CRYPTO_META[id] ?? { tab: id, icon: null, iconText: id[0], active: 'text-violet-300 border-violet-500/60 bg-violet-500/15 shadow-violet-500/15' };
        const isActive = selected === id;
        const Icon     = meta.icon;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-semibold
                        border-2 transition-all duration-200
                        ${isActive ? `${meta.active} shadow-lg` : INACTIVE}`}
          >
            <span className="w-4 h-4 flex items-center justify-center font-bold text-[11px]">
              {Icon ? <Icon className="w-3.5 h-3.5" /> : meta.iconText}
            </span>
            <span>{meta.tab}</span>
          </button>
        );
      })}
    </div>
  );
}

export default CryptoSelector;
