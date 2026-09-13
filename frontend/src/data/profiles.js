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

export const PROFILE_LIST = Object.values(PROFILES);
