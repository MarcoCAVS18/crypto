// Zustand store de autenticación por perfil
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      // currentUser: { id, name, cryptos, defaultCrypto, accentColor } | null
      currentUser: null,

      login: (userProfile) => set({ currentUser: userProfile }),

      logout: () => set({ currentUser: null }),
    }),
    {
      name: 'crypto-auth-v1',
      partialize: (state) => ({ currentUser: state.currentUser }),
    }
  )
);

export default useAuthStore;
