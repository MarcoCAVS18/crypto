import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingOverlay, useOnboarding } from './components/OnboardingOverlay';
import { OperationSheet } from './components/OperationSheet';
import { ProfileSettingsSheet } from './components/ProfileSettingsSheet';
import { useZoneAlert } from './hooks/useZoneAlert';
import { useUpcomingEvents } from './hooks/useUpcomingEvents';
import { AUTO_REFRESH_INTERVAL } from './utils/constants';
import { effectiveCashUsd } from './utils/cash';
import { cashAfter, calendarGapView } from './utils/signalView';
import { requestPermission, isSupported, getPermission } from './services/notifications';
import { subscribeToPush, unsubscribeFromPush } from './services/pushSubscription';
import { syncSettings, resetSettingsSync } from './services/settingsSync';
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
    getDecision, refreshData, clearError, loadPortfolio, setUserId,
    log, openLog, closeLog
  } = useAppStore();

  const { currentUser, logout } = useAuthStore();
  const profileCryptos = currentUser?.cryptos?.length > 0 ? currentUser.cryptos : ['BTC', 'PAXG'];

  useEffect(() => {
    setUserId(currentUser.id);
    // Tocar un aviso abre la app en ese activo (?activo=PAXG): ahí está la señal y el botón "Ya compré"
    const wanted = new URLSearchParams(window.location.search).get('activo');
    if (wanted) window.history.replaceState(null, '', window.location.pathname);
    const preferred = profileCryptos.includes(wanted) ? wanted : selectedCrypto;
    const activeCrypto = profileCryptos.includes(preferred) ? preferred : profileCryptos[0];
    if (activeCrypto !== selectedCrypto) setSelectedCrypto(activeCrypto);
    loadCryptoData(activeCrypto);
    loadPortfolio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  // Actualización automática cada 5 min mientras la app está a la vista. En segundo plano no se pide nada (ahorra llamadas),
  // y al volver (celular desbloqueado, otra pestaña) se actualiza al instante si los datos tienen más de 2 min.
  const lastUpdate = useAppStore((s) => s.lastUpdate);
  const lastUpdateRef = useRef(lastUpdate);
  lastUpdateRef.current = lastUpdate;
  useEffect(() => {
    const tick = () => { if (!document.hidden) refreshData(); };
    const t = setInterval(tick, AUTO_REFRESH_INTERVAL);
    const onVisible = () => {
      if (document.hidden) return;
      const last = lastUpdateRef.current ? new Date(lastUpdateRef.current).getTime() : 0;
      if (Date.now() - last > 2 * 60 * 1000) refreshData();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCrypto]);

  // Avisos (push): los calcula y manda el SERVIDOR con la misma señal que ves acá, con la app cerrada. Para eso (1) tus ajustes
  // (USDT, compras, comisión…) se sincronizan con tu perfil y (2) este dispositivo queda suscripto a tu usuario. La pantalla ya no
  // genera notificaciones propias: antes salían distintas a la señal y duplicadas.
  useEffect(() => { syncSettings(userState); }, [userState]);
  useEffect(() => {
    if (isSupported() && getPermission() === 'granted') subscribeToPush();
  }, [currentUser.id]);

  const currentData = cryptoData[selectedCrypto];
  const { alert: zoneAlert, dismiss: dismissAlert } = useZoneAlert(selectedCrypto, currentData?.price, currentData?.zones);
  const events = useUpcomingEvents(selectedCrypto);
  const noticeEvents = events.filter(e => e.daysUntil <= 14 || ['FOMC', 'CPI'].includes(e.name)).slice(0, 6);
  const calendarGap = calendarGapView(currentDecision);
  const hasNotice = !!zoneAlert || !!calendarGap || noticeEvents.some(e => e.daysUntil <= 2);

  // Con la app ya abierta, el toque en un aviso llega como mensaje del service worker
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMsg = (e) => {
      const sym = e.data?.type === 'activo' ? e.data.symbol : null;
      if (!sym || !profileCryptos.includes(sym)) return;
      setScreen('dashboard');
      if (useAppStore.getState().selectedCrypto === sym) refreshData(); else setSelectedCrypto(sym);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);



  const handleLogout = async () => {
    // El aviso es personal: este dispositivo deja de recibir los de este usuario (necesita la sesión, por eso va antes de cerrarla)
    await Promise.race([unsubscribeFromPush(), new Promise(r => setTimeout(r, 3000))]);
    resetSettingsSync();
    setUserId(null); logoutServer(); logout();
  };

  const handleRefresh = async () => {
    if (isSupported() && getPermission() === 'default') {
      const result = await requestPermission();
      if (result === 'granted') subscribeToPush();
    }
    refreshData();
  };

  // Al cambiar de pantalla se vuelve arriba: ahora (para que no se vea el salto) y otra vez cuando termina de salir la anterior
  const toTop = useCallback(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, []);
  const go = (id) => {
    if (id === screen) { toTop(); return; }
    setDir(SCREENS.indexOf(id) > SCREENS.indexOf(screen) ? 1 : -1);
    setScreen(id);
    toTop();
  };

  const openDetails = (tab = 'signal') => setDetails({ open: true, tab });
  const handleUserStateSubmit = ({ cashUsd, mode, targetPercent = null, feePercent = null, installments = null }) => {
    updateUserState({ cashUsd, mode, targetPercent, feePercent, installments });
    getDecision();
  };

  const portfolioSummary = portfolio.summary.find(s => s.symbol === selectedCrypto) ?? null;
  const userInitial = currentUser.initial ?? currentUser.name?.[0] ?? '?';

  return (
    <div className="min-h-svh overflow-x-clip">
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
        <AnimatePresence mode="wait" custom={dir} onExitComplete={toTop}>
          <motion.div key={screen} custom={dir} variants={screenVariants} initial="initial" animate="animate" exit="exit">
            <ErrorBoundary key={screen}>
            {screen === 'dashboard' && (
              <DashboardScreen
                selectedCrypto={selectedCrypto} cryptos={profileCryptos} onSelect={setSelectedCrypto}
                data={currentData} loading={loading} decision={currentDecision} decisionLoading={decisionLoading}
                portfolioSummary={portfolioSummary} cashUsd={effectiveCashUsd(userState)} onOpenDetails={openDetails}
              />
            )}
            {screen === 'portfolio' && <PortfolioSection />}
            {screen === 'chat' && <ChatScreen />}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav active={screen} onChange={go} />

      <NoticesSheet open={noticesOpen} onClose={() => setNoticesOpen(false)} alert={zoneAlert} onDismissAlert={dismissAlert} events={noticeEvents} calendarGap={calendarGap} />

      {log.k > 0 && (
        <OperationSheet
          key={log.k} open={log.open} onClose={closeLog} symbols={profileCryptos} draft={log.draft}
          deduct={effectiveCashUsd(userState) > 0 ? { cash: effectiveCashUsd(userState) } : null}
          onFail={(message) => useAppStore.setState({ error: `No se pudo guardar la compra: ${message}` })}
          onSaved={(data, { deduct }) => {
            // Si se descuenta, la próxima señal reparte lo que queda; en los dos casos se recalcula (el ritmo ya ve la compra nueva)
            if (deduct) updateUserState({ cashUsd: cashAfter(effectiveCashUsd(userState), data.amount_usd) });
            getDecision();
          }}
        />
      )}

      <DetailsSheet
        open={details.open} onClose={() => setDetails(d => ({ ...d, open: false }))}
        onRegister={(draft) => { setDetails(d => ({ ...d, open: false })); openLog(draft); }}
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
