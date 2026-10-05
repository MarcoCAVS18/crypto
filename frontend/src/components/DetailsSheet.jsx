// Detalles de un activo en una hoja con 3 pestañas: Señal (órdenes y por qué) · Mercado (indicadores y noticias) · Posición (tus USDT).
import { useEffect, useState } from 'react';
import { Sheet } from './ui/Sheet';
import { PillTabs } from './ui/PillTabs';
import { SignalDetails } from './SignalDetails';
import { MarketDetails } from './MarketDetails';
import { UserStateInput } from './UserStateInput';
import { effectiveCashUsd } from '../utils/cash';
import { assetName } from '../utils/signalView';

const TABS = [{ id: 'signal', label: 'Señal' }, { id: 'market', label: 'Mercado' }, { id: 'position', label: 'Posición' }];

export function DetailsSheet({ open, onClose, tab, onTabChange, marketData, decision, userState, onUserStateSubmit, decisionLoading, symbol }) {
  const [local, setLocal] = useState(tab ?? 'signal');
  useEffect(() => { if (open && tab) setLocal(tab); }, [open, tab]);
  const current = local;
  const change = (id) => { setLocal(id); onTabChange?.(id); };

  return (
    <Sheet open={open} onClose={onClose} title={assetName(symbol)} scrollKey={`${symbol}-${current}`}
      header={<div className="px-5 pb-4"><PillTabs options={TABS} value={current} onChange={change} size="sm" layoutId="details-pill" /></div>}>
      {current === 'signal' && <SignalDetails decision={decision} marketData={marketData} symbol={symbol} onConfigure={() => change('position')} />}
      {current === 'market' && marketData && <MarketDetails key={symbol} symbol={symbol} data={marketData} />}
      {current === 'position' && (
        <UserStateInput
          key={symbol}
          busy={decisionLoading}
          onSubmit={(s) => { onUserStateSubmit(s); change('signal'); }}
          initialMode={userState.mode}
          initialCashUsd={effectiveCashUsd(userState)}
          initialTarget={userState.targetPercent ?? ''}
          initialFee={userState.feePercent ?? ''}
          symbol={symbol}
        />
      )}
    </Sheet>
  );
}

export default DetailsSheet;
