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

// Activos disponibles para selección en el onboarding
export const SELECTABLE_CRYPTOS = [
  { symbol: 'BTC',  label: 'Bitcoin',   sub: 'La cripto más consolidada' },
  { symbol: 'ETH',  label: 'Ethereum',  sub: 'Smart contracts y DeFi' },
  { symbol: 'PAXG', label: 'PAXG',      sub: 'Oro tokenizado 1:1' },
];

export const PROFILE_LIST = Object.values(PROFILES);
