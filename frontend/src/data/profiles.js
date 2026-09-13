export const PROFILES = {
  marco: {
    id: 'marco',
    name: 'Marco',
    initial: 'M',
    cryptos: ['BTC', 'PAXG'],
    defaultCrypto: 'BTC',
    accentColor: 'blue',
  },
  tomas: {
    id: 'tomas',
    name: 'Tomás',
    initial: 'T',
    cryptos: ['BTC', 'ETH', 'PAXG'],
    defaultCrypto: 'BTC',
    accentColor: 'purple',
  },
  victor: {
    id: 'victor',
    name: 'Víctor',
    initial: 'V',
    cryptos: [],          // se elige en el onboarding
    defaultCrypto: 'BTC',
    accentColor: 'green',
  },
};

// Activos populares sugeridos en el onboarding (máx 2 seleccionables)
export const POPULAR_CRYPTOS = [
  { symbol: 'BTC',  label: 'Bitcoin'   },
  { symbol: 'ETH',  label: 'Ethereum'  },
  { symbol: 'SOL',  label: 'Solana'    },
  { symbol: 'ADA',  label: 'Cardano'   },
  { symbol: 'AVAX', label: 'Avalanche' },
  { symbol: 'DOGE', label: 'Dogecoin'  },
  { symbol: 'DOT',  label: 'Polkadot'  },
  { symbol: 'LINK', label: 'Chainlink' },
  { symbol: 'MATIC',label: 'Polygon'   },
  { symbol: 'PAXG', label: 'PAXG'      },
];

export const PROFILE_LIST = Object.values(PROFILES);
