// Zustand store para el estado global de la aplicación
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchCryptoData, requestDecision } from '../services/api';
import { fsAddOperation, fsGetOperations, fsDeleteOperation } from '../services/firestorePortfolio';

// ── Helper: calcula el resumen del portfolio desde las operaciones ─────────
function computePortfolioSummary(operations) {
  const bySymbol = {};
  for (const op of operations) {
    if (!bySymbol[op.symbol]) {
      bySymbol[op.symbol] = {
        symbol: op.symbol, units: 0, invested: 0,
        withdrawn: 0, fees: 0, operations: 0
      };
    }
    const s = bySymbol[op.symbol];
    s.operations += 1;
    s.fees += op.fee || 0;
    if (op.type === 'BUY') {
      s.units    += op.units;
      s.invested += op.amount_usd;
    } else if (op.type === 'SELL') {
      s.units     -= op.units;
      s.withdrawn += op.amount_usd;
    }
  }
  return Object.values(bySymbol).map(s => ({
    ...s,
    units:        Math.max(0, s.units),
    netInvested:  s.invested - s.withdrawn,
    avgBuyPrice:  s.invested > 0 && s.units > 0
      ? (s.invested - s.withdrawn) / s.units
      : 0,
    hasPosition:  s.units > 0
  }));
}

export const useAppStore = create(
  persist(
    (set, get) => ({
      // Crypto seleccionada
      selectedCrypto: 'BTC',

      // Datos del crypto actual
      cryptoData: {
        BTC:  null,
        PAXG: null
      },

      // Estado del usuario
      userState: {
        cashPercent:  50,
        mode:         'inversion',
        totalCapital: 0
      },

      // Decisión actual
      currentDecision: null,

      // Portfolio
      portfolio: {
        operations: [],
        summary:    [],
        loading:    false
      },

      // Loading states
      loading:         false,
      decisionLoading: false,
      error:           null,
      serverWaking:    false,

      // Última actualización
      lastUpdate: null,

      // ── Acciones de crypto ────────────────────────────────────────────────

      setSelectedCrypto: (symbol) => {
        set({ selectedCrypto: symbol, currentDecision: null });
        if (!get().cryptoData[symbol]) {
          get().loadCryptoData(symbol);
        }
      },

      loadCryptoData: async (symbol) => {
        set({ loading: true, error: null });
        const wakeTimer = setTimeout(() => set({ serverWaking: true }), 3000);
        try {
          const data = await fetchCryptoData(symbol);
          clearTimeout(wakeTimer);
          set((state) => ({
            cryptoData:   { ...state.cryptoData, [symbol]: data },
            loading:      false,
            serverWaking: false,
            lastUpdate:   new Date()
          }));
        } catch (error) {
          clearTimeout(wakeTimer);
          set({ loading: false, serverWaking: false, error: error.message || 'Error cargando datos' });
        }
      },

      updateUserState: (newState) => {
        set((state) => ({ userState: { ...state.userState, ...newState } }));
      },

      getDecision: async () => {
        const { selectedCrypto, userState, portfolio } = get();
        set({ decisionLoading: true, error: null });

        // Calcular contexto del portfolio para el símbolo seleccionado
        const allSummary      = computePortfolioSummary(portfolio.operations);
        const symbolSummary   = allSummary.find(s => s.symbol === selectedCrypto) || null;
        const portfolioContext = symbolSummary
          ? {
              ...symbolSummary,
              hasPosition: symbolSummary.units > 0 && symbolSummary.avgBuyPrice > 0,
              // Incluir todas las compras registradas para que el motor filtre
              // tramos ya ejecutados a precios similares
              executedBuys: portfolio.operations
                .filter(op => op.symbol === selectedCrypto && op.type === 'BUY')
                .map(op => ({ price: op.price, amount_usd: op.amount_usd }))
            }
          : null;

        try {
          const data = await requestDecision(
            selectedCrypto,
            userState.cashPercent,
            userState.mode,
            userState.totalCapital,
            portfolioContext
          );
          set({
            currentDecision: data.decision,
            decisionLoading: false,
            cryptoData: {
              ...get().cryptoData,
              [selectedCrypto]: {
                ...get().cryptoData[selectedCrypto],
                price:      data.price,
                marketMode: data.marketMode,
                zones:      data.zones
              }
            }
          });
        } catch (error) {
          set({ decisionLoading: false, error: error.message || 'Error obteniendo decisión' });
        }
      },

      refreshData: async () => {
        await get().loadCryptoData(get().selectedCrypto);
      },

      clearError: () => set({ error: null }),

      // ── Portfolio (Firestore) ─────────────────────────────────────────────

      loadPortfolio: async () => {
        set((state) => ({ portfolio: { ...state.portfolio, loading: true } }));
        try {
          const operations = await fsGetOperations();
          // Ordenar por fecha desc para la vista (Firestore ya lo devuelve así)
          const summary = computePortfolioSummary(operations);
          set((state) => ({
            portfolio: { ...state.portfolio, operations, summary, loading: false }
          }));
        } catch (err) {
          set((state) => ({ portfolio: { ...state.portfolio, loading: false } }));
          console.error('Error cargando portfolio desde Firestore:', err);
        }
      },

      addOperation: async (opData) => {
        set((state) => ({ portfolio: { ...state.portfolio, loading: true } }));
        try {
          await fsAddOperation(opData);
          await get().loadPortfolio();
        } catch (err) {
          set((state) => ({ portfolio: { ...state.portfolio, loading: false } }));
          throw err;
        }
      },

      removeOperation: async (id) => {
        try {
          await fsDeleteOperation(id);
          await get().loadPortfolio();
        } catch (err) {
          console.error('Error eliminando operación:', err);
          throw err;
        }
      }
    }),
    {
      name: 'crypto-dashboard-storage',
      partialize: (state) => ({
        userState:      state.userState,
        selectedCrypto: state.selectedCrypto
      })
    }
  )
);

export default useAppStore;
