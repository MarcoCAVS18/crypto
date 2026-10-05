// Barra inferior flotante (referencia): íconos grises y, para la pantalla activa, un círculo verde con resplandor.
import { motion } from 'framer-motion';
import { Home, Wallet, MessageCircle } from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Inicio',    icon: Home },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  { id: 'chat',      label: 'Asistente', icon: MessageCircle }
];

export function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }} aria-label="Navegación">
      <div className="max-w-xl mx-auto px-4">
        <div className="pointer-events-auto mx-auto w-full max-w-sm rounded-full bg-panel/95 backdrop-blur-xl border border-line px-3 py-2.5 flex items-center justify-around shadow-2xl shadow-black/60">
          {NAV_ITEMS.map(item => {
            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => onChange(item.id)} aria-label={item.label} aria-current={isActive ? 'page' : undefined}
                className="relative w-12 h-12 flex items-center justify-center">
                {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-full bg-accent glow-accent" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
                <item.icon className={`relative w-[22px] h-[22px] ${isActive ? 'text-accent-ink' : 'text-muted'}`} />
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default BottomNav;
