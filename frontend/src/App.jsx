// Componente principal de la aplicación
import { useEffect, useState } from 'react';
import { useAppStore } from './store/appStore';
import { Card } from './components/ui/Card';
import { Spinner } from './components/ui/Spinner';
import { CryptoSelector } from './components/CryptoSelector';
import { MarketModeIndicator } from './components/MarketModeIndicator';
import { PriceDisplay } from './components/PriceDisplay';
import { ZoneMap } from './components/ZoneMap';
import { TechnicalAnalysis } from './components/TechnicalAnalysis';
import { UserStateInput } from './components/UserStateInput';
import { DecisionPanel } from './components/DecisionPanel';
import { RulesDisplay } from './components/RulesDisplay';
import { PortfolioSection } from './components/PortfolioSection';
import { RefreshCw, AlertCircle, Menu, X, LayoutDashboard, Briefcase, AlertTriangle } from 'lucide-react';
import { formatRelativeTime } from './utils/formatters';
import { AUTO_REFRESH_INTERVAL } from './utils/constants';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase }
];

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  const {
    selectedCrypto,
    cryptoData,
    userState,
    currentDecision,
    loading,
    decisionLoading,
    error,
    serverWaking,
    lastUpdate,
    setSelectedCrypto,
    loadCryptoData,
    updateUserState,
    getDecision,
    refreshData,
    clearError
  } = useAppStore();

  // Cargar datos iniciales
  useEffect(() => {
    loadCryptoData(selectedCrypto);
  }, []);

  // Auto-refresh cada 5 minutos
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [selectedCrypto]);

  const currentData = cryptoData[selectedCrypto];

  const handleUserStateSubmit = ({ cashPercent, mode, totalCapital }) => {
    updateUserState({ cashPercent, mode, totalCapital });
    getDecision();
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <h1 className="text-base sm:text-xl font-bold text-white hidden sm:block">Crypto Context</h1>
            <CryptoSelector selected={selectedCrypto} onSelect={setSelectedCrypto} />
          </div>

          {/* Tabs — desktop */}
          <nav className="hidden sm:flex items-center gap-1 bg-gray-900/60 rounded-lg p-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                  }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="text-xs text-gray-500 hidden sm:block">
                {formatRelativeTime(lastUpdate)}
              </span>
            )}
            <button
              onClick={refreshData}
              disabled={loading}
              className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {/* Botón sidebar mobile */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors lg:hidden"
            >
              {sidebarOpen ? <X className="w-5 h-5 text-gray-400" /> : <Menu className="w-5 h-5 text-gray-400" />}
            </button>
          </div>
        </div>

        {/* Tabs — mobile */}
        <div className="sm:hidden flex border-t border-gray-700">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-500 hover:text-gray-300'
                }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Server waking banner */}
      {serverWaking && (
        <div className="bg-blue-500/20 border-b border-blue-500/50 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 text-blue-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Despertando servidor... esto puede tardar 30 segundos</span>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/20 border-b border-red-500/50 px-4 py-2">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
            <button onClick={clearError} className="text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ── TAB: Dashboard ───────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="flex flex-col lg:flex-row gap-6">
            <main className="flex-1 space-y-6 animate-fade-in">
              {loading && !currentData ? (
                <div className="flex items-center justify-center py-20">
                  <Spinner size="lg" />
                </div>
              ) : currentData ? (
                <>
                  {/* Advertencia de velas sintéticas */}
                  {currentData.candlesSource === 'synthetic' && (
                    <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>Los indicadores técnicos (RSI, EMA) están basados en datos sintéticos porque la API de candles no respondió. Refrescar puede resolverlo.</span>
                    </div>
                  )}

                  {/* Market Mode */}
                  <Card>
                    <MarketModeIndicator
                      mode={currentData.marketMode?.mode}
                      reasons={currentData.marketMode?.reasons}
                    />
                  </Card>

                  {/* Precio */}
                  <Card>
                    <PriceDisplay
                      symbol={selectedCrypto}
                      price={currentData.price}
                      change24h={currentData.change24h}
                    />
                  </Card>

                  {/* Mapa de zonas */}
                  {currentData.zones && (
                    <Card>
                      <h2 className="text-sm font-semibold text-gray-400 mb-4">Zonas de Precio</h2>
                      <ZoneMap zones={currentData.zones} currentPrice={currentData.price} />
                    </Card>
                  )}

                  {/* Análisis técnico */}
                  {currentData.technicalAnalysis && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-400">Análisis Técnico</h2>
                        {currentData.technicalAnalysis.candlesCount && (
                          <span className="text-xs text-gray-600">
                            {currentData.technicalAnalysis.candlesCount} velas 1h
                            {currentData.candlesSource === 'real' ? ' · datos reales' : ' · datos sintéticos'}
                          </span>
                        )}
                      </div>
                      <TechnicalAnalysis analysis={currentData.technicalAnalysis} />
                    </div>
                  )}

                  {/* Input del usuario */}
                  <Card>
                    <h2 className="text-sm font-semibold text-gray-400 mb-4">Tu Estado Actual</h2>
                    <UserStateInput
                      onSubmit={handleUserStateSubmit}
                      initialCash={userState.cashPercent}
                      initialMode={userState.mode}
                      initialCapital={userState.totalCapital}
                    />
                  </Card>

                  {/* Panel de decisión */}
                  {decisionLoading ? (
                    <Card className="flex items-center justify-center py-8">
                      <Spinner />
                    </Card>
                  ) : (
                    <DecisionPanel decision={currentDecision} />
                  )}
                </>
              ) : (
                <Card className="text-center py-10">
                  <p className="text-gray-400">
                    No se pudieron cargar los datos. Intenta refrescar la página.
                  </p>
                </Card>
              )}
            </main>

            {/* Sidebar - Reglas */}
            <aside className={`
              lg:w-64 lg:block
              ${sidebarOpen ? 'block' : 'hidden'}
              fixed lg:static inset-0 top-16 z-40
              lg:z-auto bg-gray-900/95 lg:bg-transparent
              p-4 lg:p-0 overflow-auto
            `}>
              <RulesDisplay />
            </aside>
          </div>
        )}

        {/* ── TAB: Portfolio ───────────────────────────────────────────── */}
        {activeTab === 'portfolio' && (
          <PortfolioSection />
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 mt-10">
        <div className="max-w-6xl mx-auto px-4 py-4 text-center text-xs text-gray-500">
          Crypto Context Dashboard — Herramienta de análisis, no consejo financiero
        </div>
      </footer>
    </div>
  );
}

export default App;
