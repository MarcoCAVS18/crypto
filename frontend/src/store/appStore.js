// Zustand store para el estado global de la aplicación
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchCryptoData, requestDecision, fetchPortfolioOperations, fetchPortfolioSummary } from '../services/api';

export const useAppStore = create(
  persist(
    (set, get) => ({
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
        mode: 'inversion',
        totalCapital: 0   // capital total disponible en USD
      },

      // Decisión actual
      currentDecision: null,

      // Portfolio
      portfolio: {
        operations: [],
        summary: [],
        loading: false
      },

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
        const { cryptoData } = get();
        if (!cryptoData[symbol]) {
          get().loadCryptoData(symbol);
        }
      },

      loadCryptoData: async (symbol) => {
        set({ loading: true, error: null });

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
            userState.mode,
            userState.totalCapital
          );

          set({
            currentDecision: data.decision,
            decisionLoading: false,
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

      refreshData: async () => {
        const { selectedCrypto } = get();
        await get().loadCryptoData(selectedCrypto);
      },

      clearError: () => set({ error: null }),

      // ── Portfolio ────────────────────────────────────────────────────────────
      loadPortfolio: async () => {
        set((state) => ({ portfolio: { ...state.portfolio, loading: true } }));
        try {
          const [opsData, summaryData] = await Promise.all([
            fetchPortfolioOperations(),
            fetchPortfolioSummary()
          ]);
          set((state) => ({
            portfolio: {
              ...state.portfolio,
              operations: opsData.operations,
              summary: summaryData.summary,
              loading: false
            }
          }));
        } catch (error) {
          set((state) => ({ portfolio: { ...state.portfolio, loading: false } }));
          console.error('Error cargando portfolio:', error);
        }
      }
    }),
    {
      name: 'crypto-dashboard-storage',
      partialize: (state) => ({
        userState: state.userState,
        selectedCrypto: state.selectedCrypto
      })
    }
  )
);

export default useAppStore;
