import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false, badge = null, accent = 'slate' }) {
  const [open, setOpen] = useState(defaultOpen);

  const accentMap = {
    slate:   { text: 'text-slate-400',   border: 'border-slate-500/20' },
    blue:    { text: 'text-blue-400',    border: 'border-blue-500/20'  },
    amber:   { text: 'text-amber-400',   border: 'border-amber-500/20' },
    emerald: { text: 'text-emerald-400', border: 'border-emerald-500/20' },
    purple:  { text: 'text-purple-400',  border: 'border-purple-500/20' },
  };
  const colors = accentMap[accent] ?? accentMap.slate;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        {Icon && <Icon className={`w-4 h-4 shrink-0 ${colors.text}`} />}
        <span className="flex-1 text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</span>
        {badge && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${colors.border} ${colors.text} mr-1`}>
            {badge}
          </span>
        )}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-slate-600" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-white/[0.05]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CollapsibleSection;
