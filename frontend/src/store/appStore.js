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
        ETH:  null,
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
        loading:    false,
        userId:     null   // marca a quién pertenecen los datos cacheados
      },

      // Loading states
      loading:         false,
      decisionLoading: false,
      error:           null,
      serverWaking:    false,

      // Usuario activo
      userId: null,

      // Última actualización
      lastUpdate: null,

      // ── Acciones de usuario ───────────────────────────────────────────────

      setUserId: (id) => {
        const prev = get().userId;
        set({ userId: id });
        // Si cambió el usuario, invalidar caché y recargar portfolio
        if (id && id !== prev) {
          const { portfolio } = get();
          if (portfolio.userId !== id || portfolio.operations.length === 0) {
            get().loadPortfolio({ force: true });
          }
        }
      },

      // ── Acciones de crypto ────────────────────────────────────────────────

      setSelectedCrypto: (symbol) => {
        set({ selectedCrypto: symbol, currentDecision: null });
        get().loadCryptoData(symbol);
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
          if (get().userState.totalCapital > 0) {
            get().getDecision();
          }
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
              // Precio actual para cálculo de P&L en el backend
              currentPrice: get().cryptoData[selectedCrypto]?.price ?? null,
              // Historial completo de compras ordenado por fecha (para análisis IA)
              allBuys: portfolio.operations
                .filter(op => op.symbol === selectedCrypto && op.type === 'BUY')
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map(op => ({ price: op.price, amount_usd: op.amount_usd, date: op.date })),
              // Ventana de ciclo activo: 4 días.
              // Solo los buys de este período bloquean la repetición de tramos.
              executedBuys: (() => {
                const cutoff = Date.now() - 4 * 24 * 3600 * 1000;
                return portfolio.operations
                  .filter(op =>
                    op.symbol === selectedCrypto &&
                    op.type === 'BUY' &&
                    new Date(op.date).getTime() >= cutoff
                  )
                  .map(op => ({ price: op.price, amount_usd: op.amount_usd, date: op.date }));
              })()
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
      // Las operaciones se cachean en localStorage por usuario.
      // loadPortfolio() es no-op si ya hay datos. Pasá { force: true } para
      // forzar un re-fetch (botón refresh, etc.).

      loadPortfolio: async ({ force = false } = {}) => {
        const { portfolio, userId } = get();
        if (!userId) return; // esperar que auth resuelva antes de leer Firestore
        // Skip si ya tenemos datos cacheados para este usuario y no se forzó
        if (!force && portfolio.userId === userId && portfolio.operations.length > 0) {
          return;
        }
        set((state) => ({ portfolio: { ...state.portfolio, loading: true } }));
        try {
          const operations = await fsGetOperations(null, userId);
          const summary    = computePortfolioSummary(operations);
          set((state) => ({
            portfolio: { ...state.portfolio, operations, summary, userId, loading: false }
          }));
        } catch (err) {
          set((state) => ({ portfolio: { ...state.portfolio, loading: false } }));
          set({ error: err.message });
        }
      },

      // Optimistic add: muestra la operación de inmediato.
      // Después del write reemplaza el id temp por el id real de Firestore
      // (sin volver a leer toda la colección).
      addOperation: async (opData) => {
        const tempId  = `temp-${Date.now()}`;
        const tempOp  = { id: tempId, ...opData, symbol: opData.symbol.toUpperCase(), type: opData.type.toUpperCase() };

        set((state) => {
          const ops = [tempOp, ...state.portfolio.operations];
          return { portfolio: { ...state.portfolio, operations: ops, summary: computePortfolioSummary(ops) } };
        });

        try {
          const userId  = get().userId;
          const realId  = await fsAddOperation(opData, userId);
          // Reemplazar el id temporal por el real, sin re-fetch
          set((state) => {
            const ops = state.portfolio.operations.map(o =>
              o.id === tempId ? { ...o, id: realId } : o
            );
            return { portfolio: { ...state.portfolio, operations: ops, summary: computePortfolioSummary(ops) } };
          });
        } catch (err) {
          // Revertir update optimista
          set((state) => {
            const ops = state.portfolio.operations.filter(o => o.id !== tempId);
            return { portfolio: { ...state.portfolio, operations: ops, summary: computePortfolioSummary(ops) } };
          });
          // Resync con Firestore por si el write llegó a completarse antes del timeout
          setTimeout(() => get().loadPortfolio({ force: true }), 3500);
          throw err;
        }
      },

      // Optimistic remove: elimina de la UI al instante, borra en Firestore en fondo.
      removeOperation: async (id) => {
        const prevOps = get().portfolio.operations;
        const newOps  = prevOps.filter(o => o.id !== id);

        // 1. Actualizar UI al instante
        set((state) => ({
          portfolio: { ...state.portfolio, operations: newOps, summary: computePortfolioSummary(newOps) }
        }));

        try {
          // 2. Borrar en Firestore
          await fsDeleteOperation(id);
        } catch (err) {
          // Revertir si falla
          set((state) => ({
            portfolio: { ...state.portfolio, operations: prevOps, summary: computePortfolioSummary(prevOps) }
          }));
          throw err;
        }
      }
    }),
    {
      name: 'crypto-dashboard-storage',
      partialize: (state) => ({
        userState:      state.userState,
        selectedCrypto: state.selectedCrypto,
        userId:         state.userId,
        // Cacheamos las operaciones del portfolio para evitar relecturas a Firestore.
        // No persistimos cryptoData (datos de mercado, deben ser frescos).
        portfolio: {
          operations: state.portfolio.operations,
          summary:    state.portfolio.summary,
          userId:     state.portfolio.userId,
          loading:    false
        }
      })
    }
  )
);

export default useAppStore;
