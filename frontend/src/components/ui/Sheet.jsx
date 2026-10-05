// Hoja inferior (móvil) / modal centrado (escritorio). Un solo patrón para detalles, ajustes y formularios.
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export function Sheet({ open, onClose, title, children, header = null, maxWidth = 'max-w-lg' }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose}
          />
          <motion.div
            key="sheet" role="dialog" aria-label={typeof title === 'string' ? title : undefined}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 340 }}
            className={`fixed z-50 bottom-0 inset-x-0 mx-auto w-full ${maxWidth} rounded-t-[32px] bg-bg border border-b-0 border-line
                        flex flex-col max-h-[90svh] sm:bottom-6 sm:rounded-[32px] sm:border-b`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="pt-3 pb-1 flex justify-center sm:hidden"><span className="w-10 h-1 rounded-full bg-white/15" /></div>
            <div className="px-5 pt-2 pb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-ink truncate">{title}</h2>
              <IconButton icon={X} label="Cerrar" onClick={onClose} size="sm" />
            </div>
            {header}
            <div className="overflow-y-auto px-5 pb-8 flex-1">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default Sheet;
