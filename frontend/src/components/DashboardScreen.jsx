import { Spinner } from './ui/Spinner';
import { Panel } from './ui/Panel';
import { AlertTriangle } from 'lucide-react';
import { AssetTabs } from './AssetTabs';
import { AssetHero } from './AssetHero';
import { SignalCard } from './SignalCard';
import { MarketSummary } from './MarketSummary';
import { FuturesPanel } from './FuturesPanel';
import { useUpcomingEvents } from '../hooks/useUpcomingEvents';

export function DashboardScreen({ selectedCrypto, cryptos, onSelect, data, loading, decision, decisionLoading, portfolioSummary, onOpenDetails }) {
  const events = useUpcomingEvents(selectedCrypto);
  const nextEvent = events.find(e => e.daysUntil <= 14 || ['FOMC', 'CPI'].includes(e.name)) ?? null;

  return (
    <div className="space-y-7">
      <AssetTabs selected={selectedCrypto} onSelect={onSelect} cryptos={cryptos} />

      {selectedCrypto === 'XAUUSDT' ? <FuturesPanel /> : loading && !data ? (
        <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
      ) : data ? (
        <>
          {data.candlesSource === 'synthetic' && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-warn/10 text-warn text-xs">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Los indicadores se calcularon con datos de respaldo, no de mercado. Actualizá para reintentar.</span>
            </div>
          )}
          <AssetHero symbol={selectedCrypto} price={data.price} change24h={data.change24h} high24h={data.high24h} low24h={data.low24h} zones={data.zones} />
          <SignalCard symbol={selectedCrypto} decision={decision} loading={decisionLoading} portfolioSummary={portfolioSummary}
            onOpenDetails={() => onOpenDetails('signal')} onConfigure={() => onOpenDetails('position')} />
          <MarketSummary data={data} nextEvent={nextEvent} onOpenMarket={() => onOpenDetails('market')} />
        </>
      ) : (
        <Panel className="text-center py-14"><p className="text-muted text-sm">No se pudieron cargar los datos. Probá actualizar.</p></Panel>
      )}
    </div>
  );
}

export default DashboardScreen;
