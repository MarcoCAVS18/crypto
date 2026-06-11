import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from './store/appStore';
import { useAuthStore } from './store/authStore';
import { Spinner } from './components/ui/Spinner';
import { CryptoSelector } from './components/CryptoSelector';
import { ProfileSelector } from './components/ProfileSelector';
import { MarketHero } from './components/MarketHero';
import { DetailsSheet } from './components/DetailsSheet';
import { DecisionPanel } from './components/DecisionPanel';
import { MacroContext } from './components/MacroContext';
import { MacroCalendarBanner } from './components/MacroCalendarBanner';
import { PortfolioSection } from './components/PortfolioSection';
import { PriceAlertBanner } from './components/PriceAlertBanner';
import { OnboardingOverlay, useOnboarding } from './components/OnboardingOverlay';
import { FloatingChat } from './components/FloatingChat';
import { RefreshCw, AlertCircle, X, LayoutDashboard, Briefcase, AlertTriangle } from 'lucide-react';
import { formatRelativeTime } from './utils/formatters';
import { AUTO_REFRESH_INTERVAL } from './utils/constants';
import { requestPermission, isSupported, getPermission } from './services/notifications';
import { subscribeToPush } from './services/pushSubscription';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'portfolio', label: 'Portfolio',  icon: Briefcase }
];

const tabVariants = {
  initial: (dir) => ({ opacity: 0, x: dir > 0 ? 24 : -24 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.28, ease: 'easeOut' } },
  exit:    (dir) => ({ opacity: 0, x: dir > 0 ? -24 : 24, transition: { duration: 0.2 } })
};

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const currentUser = useAuthStore((s) => s.currentUser);
  return currentUser ? <AuthenticatedApp /> : <ProfileSelector />;
}

// ── App autenticada ───────────────────────────────────────────────────────────
function AuthenticatedApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tabDir, setTabDir]       = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(useOnboarding());

  const {
    selectedCrypto, cryptoData, userState, currentDecision,
    loading, decisionLoading, error, serverWaking, lastUpdate,
    portfolio,
    setSelectedCrypto, loadCryptoData, updateUserState,
    getDecision, refreshData, clearError, loadPortfolio, setUserId
  } = useAppStore();

  const { currentUser, logout } = useAuthStore();
  const profileCryptos = currentUser.cryptos ?? ['BTC', 'PAXG'];

  useEffect(() => {
    setUserId(currentUser.id);
    const activeCrypto = profileCryptos.includes(selectedCrypto)
      ? selectedCrypto
      : profileCryptos[0];
    if (activeCrypto !== selectedCrypto) setSelectedCrypto(activeCrypto);
    loadCryptoData(activeCrypto);
    loadPortfolio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  useEffect(() => {
    const t = setInterval(refreshData, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCrypto]);

  const prevDecisionRef = useRef(null);
  useEffect(() => {
    const prev = prevDecisionRef.current;
    const curr = currentDecision?.action;
    prevDecisionRef.current = curr;
    if (!curr || curr === 'WAIT') return;
    if (prev === curr) return;
    if (getPermission() !== 'granted') return;
    const isBuy    = curr === 'BUY';
    const symbol   = selectedCrypto;
    const price    = cryptoData[symbol]?.price;
    const priceStr = price
      ? ` · $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : '';
    try {
      new Notification(
        isBuy ? `${symbol} — Señal de compra` : `${symbol} — Señal de venta`,
        { body: `${currentDecision.reason ?? ''}${priceStr}`.trim(), icon: '/icon.svg', badge: '/icon.svg', tag: `signal_${symbol}`, renotify: true, silent: false }
      );
    } catch (e) { console.warn('[Notifications] signal:', e.message); }
  }, [currentDecision, selectedCrypto, cryptoData]);

  const handleLogout = () => { setUserId(null); logout(); };

  const handleRefresh = async () => {
    if (isSupported() && getPermission() === 'default') {
      const result = await requestPermission();
      if (result === 'granted') subscribeToPush(currentUser.id);
    }
    refreshData();
  };

  const switchTab = (id) => {
    const ids = TABS.map(t => t.id);
    setTabDir(ids.indexOf(id) > ids.indexOf(activeTab) ? 1 : -1);
    setActiveTab(id);
  };

  const handleUserStateSubmit = ({ cashPercent, mode, totalCapital }) => {
    updateUserState({ cashPercent, mode, totalCapital });
    getDecision();
  };

  const currentData      = cryptoData[selectedCrypto];
  const portfolioSummary = portfolio.summary.find(s => s.symbol === selectedCrypto) ?? null;
  const userInitial      = currentUser.initial ?? currentUser.name?.[0] ?? '?';

  return (
    <div className="min-h-svh">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 bg-[#060916]/92 backdrop-blur-xl border-b border-white/[0.05]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

          {/* Left: logo + crypto selector */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-7 h-7 rounded-xl bg-violet-600/80 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <span className="text-white text-[11px] font-bold">C</span>
              </div>
              <span className="hidden sm:block text-sm font-semibold text-slate-300 tracking-wide">Crypto Context</span>
            </div>
            <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />
            <CryptoSelector selected={selectedCrypto} onSelect={setSelectedCrypto} cryptos={profileCryptos} />
          </div>

          {/* Center: desktop tabs */}
          <nav className="hidden sm:flex items-center bg-slate-900/50 rounded-xl p-1 border border-white/[0.05]">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors z-0
                  ${activeTab === tab.id ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 bg-violet-500/15 border border-violet-500/25 rounded-lg -z-10"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right: last update + refresh + user */}
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-[11px] text-slate-600 hidden sm:block tabular">
                {formatRelativeTime(lastUpdate)}
              </span>
            )}
            <motion.button
              onClick={handleRefresh}
              disabled={loading}
              whileTap={{ scale: 0.93 }}
              className="w-8 h-8 rounded-lg bg-slate-800/50 border border-white/[0.06] flex items-center justify-center
                         hover:bg-slate-700/60 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            </motion.button>
            <motion.button
              onClick={handleLogout}
              whileTap={{ scale: 0.93 }}
              title={`Perfil: ${currentUser.name} — Cambiar`}
              className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center
                         hover:bg-violet-600/30 transition-colors"
            >
              <span className="text-xs font-bold text-violet-300">{userInitial}</span>
            </motion.button>
          </div>
        </div>
      </header>

      {/* ── Banners ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {serverWaking && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="bg-violet-500/10 border-b border-violet-500/20 px-4 py-2.5"
          >
            <div className="max-w-3xl mx-auto flex items-center justify-center gap-2 text-violet-400 text-sm">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Despertando servidor... puede tardar ~30 segundos
            </div>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2"
          >
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={clearError} className="text-rose-400/60 hover:text-rose-400 transition-colors ml-3 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Zone alert ───────────────────────────────────────────────────────── */}
      {currentData && (
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <PriceAlertBanner symbol={selectedCrypto} price={currentData.price} zones={currentData.zones} />
        </div>
      )}

      {/* ── Page content ─────────────────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 py-5 pb-24 sm:pb-8">
        <AnimatePresence mode="wait" custom={tabDir}>

          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" custom={tabDir} variants={tabVariants}
              initial="initial" animate="animate" exit="exit" className="space-y-4">

              {loading && !currentData ? (
                <div className="flex items-center justify-center py-24">
                  <Spinner size="lg" />
                </div>
              ) : currentData ? (
                <>
                  <MacroCalendarBanner symbol={selectedCrypto} />

                  {currentData.candlesSource === 'synthetic' && (
                    <div className="flex items-start gap-2.5 p-3 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl text-amber-400 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>Indicadores basados en datos sintéticos. Refrescá para reintentar.</span>
                    </div>
                  )}

                  <MarketHero
                    symbol={selectedCrypto}
                    price={currentData.price}
                    change24h={currentData.change24h}
                    zones={currentData.zones}
                    decision={currentDecision}
                    onOpenDetails={() => setSheetOpen(true)}
                  />

                  {selectedCrypto === 'PAXG' && currentData.marketMode?.goldContext && (
                    <MacroContext goldContext={currentData.marketMode.goldContext} />
                  )}

                  {decisionLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Spinner />
                    </div>
                  ) : (
                    <DecisionPanel
                      decision={currentDecision}
                      portfolioSummary={portfolioSummary}
                      compact
                      onOpenDetails={() => setSheetOpen(true)}
                    />
                  )}

                  {!currentDecision && !decisionLoading && (
                    <button
                      onClick={() => setSheetOpen(true)}
                      className="w-full py-4 rounded-2xl bg-violet-500/10 border border-violet-500/25 text-violet-400 text-sm font-medium
                                 hover:bg-violet-500/15 transition-colors"
                    >
                      Configurá tu posición para ver una señal personalizada →
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-white/[0.05]">
                  <p className="text-slate-500 text-sm">No se pudieron cargar los datos. Intentá refrescar.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'portfolio' && (
            <motion.div key="portfolio" custom={tabDir} variants={tabVariants}
              initial="initial" animate="animate" exit="exit">
              <PortfolioSection />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── Onboarding ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showOnboarding && <OnboardingOverlay onDone={() => setShowOnboarding(false)} />}
      </AnimatePresence>

      {/* ── Details sheet ────────────────────────────────────────────────────── */}
      <DetailsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        marketData={currentData}
        decision={currentDecision}
        userState={userState}
        onUserStateSubmit={handleUserStateSubmit}
        decisionLoading={decisionLoading}
      />

      {/* ── Floating chat ─────────────────────────────────────────────────────── */}
      <FloatingChat />

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────────── */}
      <BottomTabBar activeTab={activeTab} onTabChange={switchTab} />

      {/* ── Footer (desktop only) ─────────────────────────────────────────────── */}
      <footer className="hidden sm:block border-t border-white/[0.04] mt-8 py-5">
        <p className="text-center text-[11px] text-slate-700">
          Crypto Context · Herramienta de análisis personal. No constituye asesoramiento financiero.
        </p>
      </footer>
    </div>
  );
}

// ── Bottom tab bar (mobile only) ──────────────────────────────────────────────
function BottomTabBar({ activeTab, onTabChange }) {
  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40
                 bg-[#060916]/95 backdrop-blur-xl border-t border-white/[0.06]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-all relative
                ${isActive ? 'text-violet-400' : 'text-slate-600 hover:text-slate-400'}`}
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-tab-indicator"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-violet-500 rounded-full"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
