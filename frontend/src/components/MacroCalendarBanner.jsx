import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Zap, Calendar, ChevronDown, ChevronUp, X } from 'lucide-react';
import { getUpcomingEvents } from '../data/macroCalendar';

// Umbrales de urgencia
const URGENCY = {
  today:    { label: 'Hoy',         border: 'border-red-500/40',   bg: 'bg-red-950/50',   dot: 'bg-red-400 animate-pulse',    text: 'text-red-300',    sub: 'text-red-400/70',   icon: 'text-red-400'  },
  soon:     { label: 'Esta semana', border: 'border-amber-500/30', bg: 'bg-amber-950/40', dot: 'bg-amber-400',                text: 'text-amber-200',  sub: 'text-amber-400/60', icon: 'text-amber-400' },
  upcoming: { label: 'Próximo',     border: 'border-blue-500/20',  bg: 'bg-slate-900/60', dot: 'bg-blue-400',                 text: 'text-slate-300',  sub: 'text-slate-500',    icon: 'text-blue-400'  },
};

function getUrgency(daysUntil) {
  if (daysUntil <= 1) return URGENCY.today;
  if (daysUntil <= 5) return URGENCY.soon;
  return URGENCY.upcoming;
}

function formatDate(dateStr, daysUntil) {
  const d = new Date(dateStr);
  if (daysUntil === 0) return 'Hoy';
  if (daysUntil === 1) return 'Mañana';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

const IMPACT_BADGE = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high:     'bg-amber-500/15 text-amber-400 border-amber-500/25',
};

export function MacroCalendarBanner({ symbol }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const events = getUpcomingEvents(21, symbol);
  if (!events.length || dismissed) return null;

  const next = events[0];
  const urg = getUrgency(next.daysUntil);
  const hasMore = events.length > 1;
  const isUrgent = next.daysUntil <= 1;
  const isSoon = next.daysUntil <= 5;

  // Solo mostrar el banner si hay algo relevante próximo
  // Para eventos en > 14 días, solo mostrar si es FOMC o CPI
  if (next.daysUntil > 14 && !['FOMC', 'CPI'].includes(next.name)) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="overflow-hidden"
      >
        <div className={`rounded-2xl border backdrop-blur-sm ${urg.border} ${urg.bg}`}>
          {/* Row principal */}
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Dot de urgencia */}
            <span className={`w-2 h-2 rounded-full shrink-0 ${urg.dot}`} />

            {/* Ícono */}
            {isUrgent
              ? <Zap className={`w-4 h-4 shrink-0 ${urg.icon}`} />
              : <Calendar className={`w-4 h-4 shrink-0 ${urg.icon}`} />
            }

            {/* Contenido principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-semibold ${urg.text}`}>{next.fullName}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${IMPACT_BADGE[next.impact] ?? IMPACT_BADGE.high}`}>
                  {next.impact === 'critical' ? 'Impacto alto' : 'Impacto moderado'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${urg.sub}`}>
                {formatDate(next.date, next.daysUntil)}
                {next.daysUntil > 1 && ` · en ${next.daysUntil} días`}
                {isSoon && ` · ${next.note}`}
              </p>
            </div>

            {/* Controles */}
            <div className="flex items-center gap-1 shrink-0">
              {hasMore && (
                <button
                  onClick={() => setExpanded(v => !v)}
                  className={`text-xs flex items-center gap-0.5 px-2 py-1 rounded-lg transition-colors
                    ${urg.sub} hover:bg-white/[0.06]`}
                >
                  +{events.length - 1}
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
              <button
                onClick={() => setDismissed(true)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                <X className={`w-3.5 h-3.5 ${urg.sub}`} />
              </button>
            </div>
          </div>

          {/* Eventos adicionales expandidos */}
          <AnimatePresence>
            {expanded && hasMore && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="border-t border-white/[0.05] px-4 py-2 space-y-1.5">
                  {events.slice(1).map((ev, i) => {
                    const u = getUrgency(ev.daysUntil);
                    return (
                      <div key={i} className="flex items-center gap-2.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${u.dot}`} />
                        <span className="text-xs text-slate-400 flex-1 truncate">{ev.fullName}</span>
                        <span className="text-[11px] text-slate-600 shrink-0 tabular">
                          {formatDate(ev.date, ev.daysUntil)}
                          {ev.daysUntil > 1 && ` · ${ev.daysUntil}d`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default MacroCalendarBanner;
