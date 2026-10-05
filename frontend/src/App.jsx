import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, AlertCircle, X } from 'lucide-react';
import { useAppStore } from './store/appStore';
import { useAuthStore } from './store/authStore';
import { ProfileSelector } from './components/ProfileSelector';
import { AppHeader } from './components/AppHeader';
import { BottomNav } from './components/BottomNav';
import { NoticesSheet } from './components/NoticesSheet';
import { DashboardScreen } from './components/DashboardScreen';
import { DetailsSheet } from './components/DetailsSheet';
import { PortfolioSection } from './components/PortfolioSection';
import { ChatScreen } from './components/ChatScreen';
import { OnboardingOverlay, useOnboarding } from './components/OnboardingOverlay';
import { ProfileSettingsSheet } from './components/ProfileSettingsSheet';
import { useZoneAlert } from './hooks/useZoneAlert';
import { useUpcomingEvents } from './hooks/useUpcomingEvents';
import { AUTO_REFRESH_INTERVAL } from './utils/constants';
import { requestPermission, isSupported, getPermission } from './services/notifications';
import { subscribeToPush } from './services/pushSubscription';
import { getToken } from './services/session';
import { logoutServer } from './services/firestoreAuth';

const TITLES = { dashboard: 'Mercado', portfolio: 'Tu portfolio', chat: 'Asistente' };
const SCREENS = ['dashboard', 'portfolio', 'chat'];

const screenVariants = {
  initial: (dir) => ({ opacity: 0, x: dir > 0 ? 24 : -24 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.26, ease: 'easeOut' } },
  exit: (dir) => ({ opacity: 0, x: dir > 0 ? -24 : 24, transition: { duration: 0.16 } })
};

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const currentUser = useAuthStore((s) => s.currentUser);
  // Sesiones guardadas por la versión anterior (sin token del servidor): se pide el PIN una vez para crear la sesión
  const hasSession = !!getToken();
  useEffect(() => {
    if (currentUser && !hasSession) useAuthStore.getState().logout();
  }, [currentUser, hasSession]);
  return currentUser && hasSession ? <AuthenticatedApp /> : <ProfileSelector />;
}

// ── App autenticada ───────────────────────────────────────────────────────────
function AuthenticatedApp() {
  const [screen, setScreen] = useState('dashboard');
  const [dir, setDir] = useState(1);
  const [details, setDetails] = useState({ open: false, tab: 'signal' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(useOnboarding());

  const {
    selectedCrypto, cryptoData, userState, currentDecision,
    loading, decisionLoading, error, serverWaking,
    portfolio,
    setSelectedCrypto, loadCryptoData, updateUserState,
    getDecision, refreshData, clearError, loadPortfolio, setUserId
  } = useAppStore();

  const { currentUser, logout } = useAuthStore();
  const profileCryptos = currentUser?.cryptos?.length > 0 ? currentUser.cryptos : ['BTC', 'PAXG'];

  useEffect(() => {
    setUserId(currentUser.id);
    const activeCrypto = profileCryptos.includes(selectedCrypto) ? selectedCrypto : profileCryptos[0];
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

  // Notificación nativa cuando la señal pasa a comprar/vender
  const prevDecisionRef = useRef(null);
  useEffect(() => {
    const prev = prevDecisionRef.current;
    const curr = currentDecision?.action;
    prevDecisionRef.current = curr;
    if (!curr || curr === 'WAIT' || prev === curr || getPermission() !== 'granted') return;
    const price = cryptoData[selectedCrypto]?.price;
    const priceStr = price ? ` · $${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '';
    try {
      new Notification(
        curr === 'BUY' ? `${selectedCrypto} — Señal de compra` : `${selectedCrypto} — Señal de venta`,
        { body: `${currentDecision.reason ?? ''}${priceStr}`.trim(), icon: '/icon.svg', badge: '/icon.svg', tag: `signal_${selectedCrypto}`, renotify: true, silent: false }
      );
    } catch (e) { console.warn('[Notifications] signal:', e.message); }
  }, [currentDecision, selectedCrypto, cryptoData]);

  const currentData = cryptoData[selectedCrypto];
  const { alert: zoneAlert, dismiss: dismissAlert } = useZoneAlert(selectedCrypto, currentData?.price, currentData?.zones);
  const events = useUpcomingEvents(selectedCrypto);
  const noticeEvents = events.filter(e => e.daysUntil <= 14 || ['FOMC', 'CPI'].includes(e.name)).slice(0, 6);
  const hasNotice = !!zoneAlert || noticeEvents.some(e => e.daysUntil <= 2);

  const handleLogout = () => { setUserId(null); logoutServer(); logout(); };

  const handleRefresh = async () => {
    if (isSupported() && getPermission() === 'default') {
      const result = await requestPermission();
      if (result === 'granted') subscribeToPush(currentUser.id);
    }
    refreshData();
  };

  const go = (id) => {
    setDir(SCREENS.indexOf(id) > SCREENS.indexOf(screen) ? 1 : -1);
    setScreen(id);
    window.scrollTo({ top: 0 });
  };

  const openDetails = (tab = 'signal') => setDetails({ open: true, tab });
  const handleUserStateSubmit = ({ cashUsd, mode, targetPercent = null, feePercent = null }) => {
    updateUserState({ cashUsd, mode, targetPercent, feePercent });
    getDecision();
  };

  const portfolioSummary = portfolio.summary.find(s => s.symbol === selectedCrypto) ?? null;
  const userInitial = currentUser.initial ?? currentUser.name?.[0] ?? '?';

  return (
    <div className="min-h-svh overflow-x-hidden">
      <AppHeader
        initial={userInitial} name={currentUser.name} title={TITLES[screen]}
        onOpenProfile={() => setSettingsOpen(true)} onRefresh={handleRefresh} refreshing={loading}
        hasNotice={hasNotice} onOpenNotices={() => setNoticesOpen(true)}
      />

      <AnimatePresence>
        {serverWaking && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 overflow-hidden">
            <div className="max-w-xl mx-auto my-2 flex items-center justify-center gap-2 rounded-full bg-panel border border-line py-2.5 text-sm text-muted">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Despertando el servidor… puede tardar ~30 s
            </div>
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 overflow-hidden">
            <div className="max-w-xl mx-auto my-2 flex items-start gap-2.5 rounded-[22px] bg-pink/10 px-4 py-3 text-sm text-pink">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={clearError} aria-label="Cerrar" className="shrink-0 opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-xl mx-auto px-4 pt-3 pb-36">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={screen} custom={dir} variants={screenVariants} initial="initial" animate="animate" exit="exit">
            {screen === 'dashboard' && (
              <DashboardScreen
                selectedCrypto={selectedCrypto} cryptos={profileCryptos} onSelect={setSelectedCrypto}
                data={currentData} loading={loading} decision={currentDecision} decisionLoading={decisionLoading}
                portfolioSummary={portfolioSummary} onOpenDetails={openDetails}
              />
            )}
            {screen === 'portfolio' && <PortfolioSection />}
            {screen === 'chat' && <ChatScreen />}
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav active={screen} onChange={go} />

      <NoticesSheet open={noticesOpen} onClose={() => setNoticesOpen(false)} alert={zoneAlert} onDismissAlert={dismissAlert} events={noticeEvents} />

      <DetailsSheet
        open={details.open} onClose={() => setDetails(d => ({ ...d, open: false }))}
        tab={details.tab} onTabChange={(tab) => setDetails(d => ({ ...d, tab }))}
        marketData={currentData} decision={currentDecision} userState={userState}
        onUserStateSubmit={handleUserStateSubmit} decisionLoading={decisionLoading} symbol={selectedCrypto}
      />

      <ProfileSettingsSheet
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          const updated = useAuthStore.getState().currentUser?.cryptos ?? profileCryptos;
          if (!updated.includes(selectedCrypto) && updated.length > 0) {
            setSelectedCrypto(updated[0]);
            loadCryptoData(updated[0]);
          }
        }}
        onLogout={() => { setSettingsOpen(false); handleLogout(); }}
      />

      <AnimatePresence>
        {showOnboarding && <OnboardingOverlay onDone={() => setShowOnboarding(false)} />}
      </AnimatePresence>
    </div>
  );
}
