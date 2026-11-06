// Avisos (campana): alerta de zona + próximos eventos macro. Reemplaza las dos banners que ocupaban la parte de arriba.
import { TrendingUp, TrendingDown, CalendarDays, CalendarX } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { Panel } from './ui/Panel';
import { Row, Rows } from './ui/Row';
import { eventDay } from '../hooks/useUpcomingEvents';

export function NoticesSheet({ open, onClose, alert, onDismissAlert, events, calendarGap = null }) {
  const hasAny = !!alert || events.length > 0 || !!calendarGap;
  return (
    <Sheet open={open} onClose={onClose} title="Avisos">
      <div className="space-y-5">
        {calendarGap && (
          <Panel tone="soft" className="flex gap-3">
            <CalendarX className="w-5 h-5 text-warn shrink-0 mt-0.5" />
            <div><p className="text-sm font-semibold text-ink">{calendarGap.title}</p><p className="text-xs text-muted mt-0.5 leading-relaxed">{calendarGap.text}</p></div>
          </Panel>
        )}

        {alert && (
          <Panel tone="soft" className="flex items-center gap-4">
            <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${alert.type === 'buy' ? 'bg-accent/15 text-accent' : 'bg-pink/15 text-pink'}`}>
              {alert.type === 'buy' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{alert.message}</p>
              <p className="text-xs text-muted mt-0.5">${alert.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · {alert.hint}</p>
            </div>
            <button onClick={onDismissAlert} className="text-xs font-semibold text-muted hover:text-ink px-3 py-2 rounded-full bg-panel-2">Descartar</button>
          </Panel>
        )}

        {events.length > 0 && (
          <div>
            <p className="flex items-center gap-2 text-xs text-muted mb-1"><CalendarDays className="w-4 h-4" /> Próximos eventos macro</p>
            <Rows>
              {events.map((ev, i) => (
                <Row
                  key={`${ev.date}-${ev.name}-${i}`}
                  label={ev.fullName}
                  sub={[ev.impact === 'critical' ? 'Impacto alto' : 'Impacto moderado', ev.verified === false ? 'fecha por confirmar' : null].filter(Boolean).join(' · ')}
                  value={eventDay(ev)}
                  tone={ev.daysUntil <= 1 ? 'warn' : 'ink'}
                />
              ))}
            </Rows>
          </div>
        )}

        {!hasAny && <p className="text-sm text-muted text-center py-10">No hay avisos por ahora.</p>}
      </div>
    </Sheet>
  );
}

export default NoticesSheet;
