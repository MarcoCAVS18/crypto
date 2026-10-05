import { PillTabs } from './ui/PillTabs';
import { assetTab } from '../utils/signalView';

export function AssetTabs({ selected, onSelect, cryptos }) {
  return <PillTabs layoutId="asset-pill" scroll value={selected} onChange={onSelect} options={cryptos.map(id => ({ id, label: assetTab(id) }))} />;
}

export default AssetTabs;
