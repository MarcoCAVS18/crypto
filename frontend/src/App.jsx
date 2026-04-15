import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from './store/appStore';
import { useAuthStore } from './store/authStore';
import { Card } from './components/ui/Card';
import { Spinner } from './components/ui/Spinner';
import { CryptoSelector } from './components/CryptoSelector';
import { ProfileSelector } from './components/ProfileSelector';
import { MarketModeIndicator } from './components/MarketModeIndicator';
import { PriceDisplay } from './components/PriceDisplay';
import { ZoneMap } from './components/ZoneMap';
import { TechnicalAnalysis } from './components/TechnicalAnalysis';
import { UserStateInput } from './components/UserStateInput';
import { DecisionPanel } from './components/DecisionPanel';
import { MacroContext } from './components/MacroContext';
import { MacroCalendarBanner } from './components/MacroCalendarBanner';
import { PortfolioSection } from './components/PortfolioSection';
import { RefreshCw, AlertCircle, X, LayoutDashboard, Briefcase, AlertTriangle, UserCircle } from 'lucide-react';
import { formatRelativeTime } from './utils/formatters';
import { AUTO_REFRESH_INTERVAL } from './utils/constants';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'portfolio', label: 'Portfolio',  icon: Briefcase }
];

const tabVariants = {
  initial: (dir) => ({ opacity: 0, x: dir > 0 ? 24 : -24 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.28, ease: 'easeOut' } },
  exit:    (dir) => ({ opacity: 0, x: dir > 0 ? -24 : 24, transition: { duration: 0.2 } })
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tabDir, setTabDir] = useState(1);

  const {
    selectedCrypto, cryptoData, userState, currentDecision,
    loading, decisionLoading, error, serverWaking, lastUpdate,
    portfolio,
    setSelectedCrypto, loadCryptoData, updateUserState,
    getDecision, refreshData, clearError, loadPortfolio, setUserId
  } = useAppStore();

  const { currentUser, logout } = useAuthStore();

  // Si no hay usuario autenticado, mostrar pantalla de selección de perfil
  if (!currentUser) {
    return <ProfileSelector />;
  }

  // Guardar cryptos válidas para el perfil activo
  const profileCryptos = currentUser.cryptos ?? ['BTC', 'PAXG'];

  // Carga datos de mercado Y portfolio cuando el usuario cambia
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    setUserId(currentUser.id);
    // Si la crypto seleccionada no está en el perfil, resetear a la primera
    const activeCrypto = profileCryptos.includes(selectedCrypto)
      ? selectedCrypto
      : profileCryptos[0];
    if (activeCrypto !== selectedCrypto) {
      setSelectedCrypto(activeCrypto);
    }
    loadCryptoData(activeCrypto);
    loadPortfolio();
  }, [currentUser?.id]);

  const handleLogout = () => {
    setUserId(null);
    logout();
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const t = setInterval(refreshData, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(t);
  }, [selectedCrypto]);

  const switchTab = (id) => {
    const ids = TABS.map(t => t.id);
    setTabDir(ids.indexOf(id) > ids.indexOf(activeTab) ? 1 : -1);
    setActiveTab(id);
  };

  const currentData = cryptoData[selectedCrypto];

  // Portfolio del símbolo activo para el preview DCA en DecisionPanel
  const portfolioSummary = portfolio.summary.find(s => s.symbol === selectedCrypto) ?? null;

  return (
    <div className="min-h-svh">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/[0.05]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Logo + selector */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-blue-600/80 flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">C</span>
              </div>
              <span className="text-sm font-semibold text-slate-300 tracking-wide">Crypto Context</span>
            </div>
            <div className="hidden sm:block w-px h-5 bg-white/[0.08]" />
            <CryptoSelector selected={selectedCrypto} onSelect={setSelectedCrypto} cryptos={profileCryptos} />
          </div>

          {/* Tabs — desktop */}
          <nav className="hidden sm:flex items-center bg-slate-900/60 rounded-xl p-1 border border-white/[0.05]">
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
                    className="absolute inset-0 bg-slate-700/60 border border-white/[0.08] rounded-lg -z-10"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-[11px] text-slate-600 hidden sm:block tabular">
                {formatRelativeTime(lastUpdate)}
              </span>
            )}
            <motion.button
              onClick={refreshData}
              disabled={loading}
              whileTap={{ scale: 0.93 }}
              className="w-8 h-8 rounded-lg bg-slate-800/80 border border-white/[0.06] flex items-center justify-center
                         hover:bg-slate-700/80 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            </motion.button>
            <motion.button
              onClick={handleLogout}
              whileTap={{ scale: 0.93 }}
              title={`Perfil: ${currentUser.name} — Cambiar`}
              className="w-8 h-8 rounded-lg bg-slate-800/80 border border-white/[0.06] flex items-center justify-center
                         hover:bg-slate-700/80 transition-colors"
            >
              <UserCircle className="w-4 h-4 text-slate-400" />
            </motion.button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="sm:hidden flex border-t border-white/[0.05]">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors relative
                ${activeTab === tab.id ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="mobile-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Banners ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {serverWaking && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2.5"
          >
            <div className="max-w-3xl mx-auto flex items-center justify-center gap-2 text-blue-400 text-sm">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Despertando servidor... puede tardar ~30 segundos
            </div>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-500/10 border-b border-red-500/20 px-4 py-2"
          >
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={clearError} className="text-red-400/60 hover:text-red-400 transition-colors ml-3 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page content ─────────────────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait" custom={tabDir}>
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              custom={tabDir}
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              {loading && !currentData ? (
                <div className="flex items-center justify-center py-24">
                  <Spinner size="lg" />
                </div>
              ) : currentData ? (
                <>
                  {/* Calendario macro — eventos próximos que pueden generar volatilidad */}
                  <MacroCalendarBanner symbol={selectedCrypto} />

                  {currentData.candlesSource === 'synthetic' && (
                    <div className="flex items-start gap-2.5 p-3.5 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl text-amber-400 text-sm">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>Indicadores técnicos basados en datos sintéticos (API de velas no respondió). Refrescá para reintentar.</span>
                    </div>
                  )}

                  {/* Market Mode */}
                  <Card>
                    <MarketModeIndicator
                      mode={currentData.marketMode?.mode}
                      reasons={currentData.marketMode?.reasons}
                    />
                  </Card>

                  {/* Gold macro context — PAXG only */}
                  {selectedCrypto === 'PAXG' && currentData.marketMode?.goldContext && (
                    <MacroContext goldContext={currentData.marketMode.goldContext} />
                  )}

                  {/* Price */}
                  <Card>
                    <PriceDisplay
                      symbol={selectedCrypto}
                      price={currentData.price}
                      change24h={currentData.change24h}
                    />
                  </Card>

                  {/* Zone map */}
                  {currentData.zones && (
                    <Card>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Mapa de Zonas</span>
                      </div>
                      <ZoneMap zones={currentData.zones} currentPrice={currentData.price} />
                    </Card>
                  )}

                  {/* Technical analysis */}
                  {currentData.technicalAnalysis && (
                    <div>
                      <div className="flex items-center justify-between mb-3 px-0.5">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Análisis Técnico</span>
                        {currentData.technicalAnalysis.candlesCount && (
                          <span className="text-[10px] text-slate-700">
                            {currentData.technicalAnalysis.candlesCount} velas 1h
                            {currentData.candlesSource === 'real' ? ' · reales' : ' · sintéticas'}
                          </span>
                        )}
                      </div>
                      <TechnicalAnalysis analysis={currentData.technicalAnalysis} />
                    </div>
                  )}

                  {/* User state */}
                  <Card>
                    <div className="mb-4">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Tu Posición Actual</span>
                    </div>
                    <UserStateInput
                      onSubmit={({ cashPercent, mode, totalCapital }) => {
                        updateUserState({ cashPercent, mode, totalCapital });
                        getDecision();
                      }}
                      initialCash={userState.cashPercent}
                      initialMode={userState.mode}
                      initialCapital={userState.totalCapital}
                    />
                  </Card>

                  {/* Decision */}
                  {decisionLoading ? (
                    <Card className="flex items-center justify-center py-10">
                      <div className="flex flex-col items-center gap-3">
                        <Spinner />
                        <span className="text-xs text-slate-500">Analizando señal...</span>
                      </div>
                    </Card>
                  ) : (
                    <DecisionPanel decision={currentDecision} portfolioSummary={portfolioSummary} />
                  )}
                </>
              ) : (
                <Card className="text-center py-16">
                  <p className="text-slate-500 text-sm">No se pudieron cargar los datos. Intenta refrescar.</p>
                </Card>
              )}
            </motion.div>
          )}

          {activeTab === 'portfolio' && (
            <motion.div
              key="portfolio"
              custom={tabDir}
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <PortfolioSection />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.04] mt-12 py-5">
        <p className="text-center text-[11px] text-slate-700">
          Crypto Context · Herramienta de análisis personal. No constituye asesoramiento financiero.
        </p>
      </footer>
    </div>
  );
}
