// Selector en píldoras (rangos del gráfico, activos, secciones). Activa = verde sólido; inactiva = gris oscuro.
import { motion } from 'framer-motion';

export function PillTabs({ options, value, onChange, size = 'md', className = '', scroll = false, layoutId = 'pill' }) {
  const pad = size === 'sm' ? 'px-3.5 py-1.5 text-xs' : 'px-5 py-2.5 text-sm';
  return (
    <div className={`flex gap-2 ${scroll ? 'overflow-x-auto no-scrollbar -mx-4 px-4' : ''} ${className}`} role="tablist">
      {options.map(o => {
        const active = o.id === value;
        return (
          <button
            key={o.id} role="tab" aria-selected={active} onClick={() => onChange(o.id)}
            className={`relative shrink-0 rounded-full font-semibold transition-colors ${pad} ${active ? 'text-accent-ink' : 'bg-panel-2 text-muted hover:text-ink'}`}
          >
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
            <span className="relative flex items-center gap-1.5">{o.icon}{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default PillTabs;
