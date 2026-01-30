// Zustand store para el estado global de la aplicación
import { create } from 'zustand';
import { fetchCryptoData, requestDecision } from '../services/api';

export const useAppStore = create((set, get) => ({
  // Crypto seleccionada
  selectedCrypto: 'BTC',

  // Datos del crypto actual
  cryptoData: {
    BTC: null,
    PAXG: null
  },

  // Estado del usuario
  userState: {
    cashPercent: 50,
    mode: 'inversion'
  },

  // Decisión actual
  currentDecision: null,

  // Loading states
  loading: false,
  decisionLoading: false,
  error: null,
  serverWaking: false,

  // Última actualización
  lastUpdate: null,

  // Acciones
  setSelectedCrypto: (symbol) => {
    set({ selectedCrypto: symbol, currentDecision: null });
    // Cargar datos si no existen
    const { cryptoData } = get();
    if (!cryptoData[symbol]) {
      get().loadCryptoData(symbol);
    }
  },

  loadCryptoData: async (symbol) => {
    set({ loading: true, error: null });

    // Detectar si el servidor tarda más de 3 seg (probablemente dormido)
    const wakeTimer = setTimeout(() => {
      set({ serverWaking: true });
    }, 3000);

    try {
      const data = await fetchCryptoData(symbol);
      clearTimeout(wakeTimer);
      set({ serverWaking: false });
      set((state) => ({
        cryptoData: {
          ...state.cryptoData,
          [symbol]: data
        },
        loading: false,
        lastUpdate: new Date()
      }));
    } catch (error) {
      clearTimeout(wakeTimer);
      set({
        loading: false,
        serverWaking: false,
        error: error.message || 'Error cargando datos'
      });
    }
  },

  updateUserState: (newState) => {
    set((state) => ({
      userState: {
        ...state.userState,
        ...newState
      }
    }));
  },

  getDecision: async () => {
    const { selectedCrypto, userState } = get();
    set({ decisionLoading: true, error: null });

    try {
      const data = await requestDecision(
        selectedCrypto,
        userState.cashPercent,
        userState.mode
      );

      set({
        currentDecision: data.decision,
        decisionLoading: false,
        // Actualizar también los datos del crypto
        cryptoData: {
          ...get().cryptoData,
          [selectedCrypto]: {
            ...get().cryptoData[selectedCrypto],
            price: data.price,
            marketMode: data.marketMode,
            zones: data.zones
          }
        }
      });
    } catch (error) {
      set({
        decisionLoading: false,
        error: error.message || 'Error obteniendo decisión'
      });
    }
  },

  // Refrescar todos los datos
  refreshData: async () => {
    const { selectedCrypto } = get();
    await get().loadCryptoData(selectedCrypto);
  },

  // Limpiar error
  clearError: () => set({ error: null })
}));

export default useAppStore;
