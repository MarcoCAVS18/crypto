// Resumen del mercado en UN panel de filas (modo, tendencia, RSI, zona, próximo evento, estado de los datos).
// El detalle (macro, noticias, indicadores) vive en la hoja "Detalles → Mercado": acá no se repite nada.
import { Panel } from './ui/Panel';
import { Row, Rows } from './ui/Row';
import { Section } from './ui/Section';
import { ChevronRight } from 'lucide-react';
import { modeView, trendText, trendTone, rsiTag, rsiTone, zoneView, dataStatus, fmtPrice } from '../utils/signalView';
import { eventDay } from '../hooks/useUpcomingEvents';

export function MarketSummary({ data, nextEvent, onOpenMarket }) {
  const mm = data?.marketMode, ta = data?.technicalAnalysis, zone = zoneView(data?.zones?.currentZone);
  const mode = modeView(mm), ds = dataStatus(mm);
  const chev = <ChevronRight className="w-4 h-4 text-faint inline ml-1" />;
  return (
    <Section title="Mercado" action={<button onClick={onOpenMarket} className="text-sm text-accent font-semibold">Ver todo</button>}>
      <Panel className="!py-1">
        <Rows>
          <Row label="Contexto" sub={mm?.score != null ? `Puntaje ${mm.score > 0 ? '+' : ''}${mm.score.toFixed(2)}` : null} value={mode.label} tone={mode.tone} onClick={onOpenMarket} />
          {ta && <Row label="Tendencia" sub={`Corto plazo · largo plazo`} right={
            <p className="text-sm font-semibold"><span className={trendTone(ta.trendShort) === 'accent' ? 'text-accent' : 'text-pink'}>{trendText(ta.trendShort)}</span><span className="text-faint"> · </span><span className={trendTone(ta.trendLong) === 'accent' ? 'text-accent' : 'text-pink'}>{trendText(ta.trendLong)}</span></p>} />}
          {ta?.rsi != null && <Row label="RSI 14" sub={rsiTag(ta.rsi)} value={ta.rsi.toFixed(0)} tone={rsiTone(ta.rsi)} />}
          <Row label="Zona de precio" sub={data?.zones?.buy ? `Compra hasta ${fmtPrice(data.zones.buy.max)}` : null} value={zone.label.replace('Zona ', '')} tone={zone.tone} />
          {nextEvent && <Row label={nextEvent.fullName} sub={nextEvent.verified === false ? 'fecha por confirmar' : (nextEvent.impact === 'critical' ? 'Impacto alto' : 'Impacto moderado')} value={eventDay(nextEvent)} tone={nextEvent.daysUntil <= 1 ? 'warn' : 'ink'} />}
          {ds.known && <Row label="Datos" sub={ds.problems ? 'Faltan o están desactualizados' : null} right={<p className={`text-sm font-semibold ${ds.problems ? 'text-warn' : 'text-accent'}`}>{ds.text}{ds.problems ? chev : null}</p>} onClick={ds.problems ? onOpenMarket : null} />}
        </Rows>
      </Panel>
    </Section>
  );
}

export default MarketSummary;
