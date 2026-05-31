// AI Signal History stats panel — shown in the Portfolio tab
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Clock, TrendingDown, Activity, AlertCircle, ChevronDown } from 'lucide-react';
import { fetchDecisions } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';

// ── Decision config ────────────────────────────────────────────────────────────

const DECISION_CFG = {
  BUY: {
    label: 'BUY',
    Icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    bar: 'bg-emerald-400',
    dot: 'bg-emerald-400',
    ring: 'ring-emerald-400/30',
    pill: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/25',
  },
  WAIT: {
    label: 'WAIT',
    Icon: Clock,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    bar: 'bg-amber-400',
    dot: 'bg-amber-400',
    ring: 'ring-amber-400/30',
    pill: 'bg-amber-400/15 text-amber-400 border-amber-400/25',
  },
  SELL: {
    label: 'SELL',
    Icon: TrendingDown,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/20',
    bar: 'bg-red-400',
    dot: 'bg-red-400',
    ring: 'ring-red-400/30',
    pill: 'bg-red-400/15 text-red-400 border-red-400/25',
  },
};

const TIMELINE_PAGE = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────

function outcomeOf(decision, signalPrice, currentPrice) {
  if (!signalPrice || !currentPrice || decision === 'WAIT') return null;
  const pct = ((currentPrice - signalPrice) / signalPrice) * 100;
  if (decision === 'BUY')  return { pct,  good: pct > 0 };
  if (decision === 'SELL') return { pct: -pct, good: pct < 0 };
  return null;
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtPrice(price) {
  if (price == null) return null;
  const p = parseFloat(price);
  if (isNaN(p)) return null;
  if (p >= 1000) return '$' + Math.round(p).toLocaleString('en-US');
  return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function computeStats(decisions) {
  const total = decisions.length;
  if (total === 0) {
    return { total: 0, buy: 0, wait: 0, sell: 0, buyPct: 0, waitPct: 0, sellPct: 0 };
  }
  const buy  = decisions.filter(d => d.decision === 'BUY').length;
  const wait = decisions.filter(d => d.decision === 'WAIT').length;
  const sell = decisions.filter(d => d.decision === 'SELL').length;
  return {
    total,
    buy,  wait,  sell,
    buyPct:  Math.round((buy  / total) * 100),
    waitPct: Math.round((wait / total) * 100),
    sellPct: Math.round((sell / total) * 100),
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Animated percentage bar */
function StatBar({ pct, barClass }) {
  return (
    <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${barClass}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.55, ease: 'easeOut', delay: 0.08 }}
      />
    </div>
  );
}

/** One column in the 3-col stats grid */
function StatCol({ label, count, pct, cfg }) {
  const Icon = cfg.Icon;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3 h-3 shrink-0 ${cfg.color}`} />
        <span className="text-[10px] uppercase tracking-widest text-slate-500 truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-base font-bold tabular leading-none ${cfg.color}`}>{count}</span>
        <span className="text-[10px] text-slate-600 tabular">{pct}%</span>
      </div>
      <StatBar pct={pct} barClass={cfg.bar} />
    </div>
  );
}

/** Single row in the mini timeline */
function TimelineRow({ entry, index, isLast, currentPrice }) {
  const cfg = DECISION_CFG[entry.decision] ?? DECISION_CFG.WAIT;
  const price   = fmtPrice(entry.price);
  const outcome = outcomeOf(entry.decision, entry.price, currentPrice);
  const outSign = outcome ? (outcome.pct >= 0 ? '+' : '') : '';

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="flex items-start gap-2.5 min-w-0"
    >
      {/* Timeline connector */}
      <div className="flex flex-col items-center shrink-0 self-stretch pt-0.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ring-2 ${cfg.ring} ${cfg.dot}`} />
        {!isLast && <div className="w-px flex-1 bg-white/[0.05] mt-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 flex items-center justify-between gap-2 min-w-0 ${!isLast ? 'pb-3' : ''}`}>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-[10px] text-slate-500 tabular shrink-0">{fmtDate(entry.timestamp)}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cfg.pill}`}>
            {cfg.label}
          </span>
          {entry.marketMode && (
            <span className="text-[10px] text-slate-600 truncate hidden sm:inline">
              {entry.marketMode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {price && (
            <span className="text-[10px] text-slate-500 tabular font-mono">{price}</span>
          )}
          {outcome && (
            <span className={`text-[10px] font-semibold tabular font-mono px-1.5 py-0.5 rounded ${
              outcome.good
                ? 'bg-emerald-400/10 text-emerald-400'
                : 'bg-red-400/10 text-red-400'
            }`}>
              {outSign}{outcome.pct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Stats + timeline panel for one symbol */
function SymbolStats({ decisions, currentPrice }) {
  const [showAll, setShowAll] = useState(false);

  const stats = computeStats(decisions);
  const sorted = [...decisions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const visible = showAll ? sorted : sorted.slice(0, TIMELINE_PAGE);
  const hasMore = sorted.length > TIMELINE_PAGE;

  if (stats.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-600">
        <Activity className="w-5 h-5 opacity-40" />
        <span className="text-xs">No signals recorded yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Total badge */}
      <div className="flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span className="text-xs text-slate-500">
          <span className="text-slate-300 font-semibold tabular">{stats.total}</span> signals in history
        </span>
      </div>

      {/* 3-col stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCol label="BUY"  count={stats.buy}  pct={stats.buyPct}  cfg={DECISION_CFG.BUY}  />
        <StatCol label="WAIT" count={stats.wait} pct={stats.waitPct} cfg={DECISION_CFG.WAIT} />
        <StatCol label="SELL" count={stats.sell} pct={stats.sellPct} cfg={DECISION_CFG.SELL} />
      </div>

      {/* Divider */}
      <div className="border-t border-white/[0.04]" />

      {/* Mini timeline */}
      <div>
        <span className="text-[10px] uppercase tracking-widest text-slate-600 block mb-3">
          Last {Math.min(stats.total, TIMELINE_PAGE)} signals
        </span>

        <div>
          <AnimatePresence initial={false}>
            {visible.map((entry, i) => (
              <TimelineRow
                key={`${entry.timestamp}-${entry.decision}-${i}`}
                entry={entry}
                index={i}
                isLast={i === visible.length - 1}
                currentPrice={currentPrice}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Show more / show less toggle */}
        {hasMore && (
          <motion.button
            onClick={() => setShowAll(v => !v)}
            whileTap={{ scale: 0.97 }}
            className="mt-3 flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            <motion.span animate={{ rotate: showAll ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.span>
            {showAll
              ? 'Show less'
              : `Show ${sorted.length - TIMELINE_PAGE} more`}
          </motion.button>
        )}
      </div>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <Activity className="w-4 h-4 text-slate-600 animate-pulse" />
        <div className="h-3.5 w-36 rounded-full bg-white/[0.06] animate-pulse" />
      </div>

      {/* Fake tab pills */}
      <div className="flex items-center gap-1.5 mb-5">
        {[48, 40].map((w, i) => (
          <div key={i} className="h-6 rounded-full bg-white/[0.04] animate-pulse" style={{ width: w }} />
        ))}
      </div>

      {/* Fake stat bars */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-2.5 w-12 rounded bg-white/[0.04] animate-pulse" />
            <div className="h-4 w-8 rounded bg-white/[0.05] animate-pulse" />
            <div className="h-1 w-full rounded-full bg-white/[0.04] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Fake timeline rows */}
      <div className="border-t border-white/[0.04] pt-4 space-y-3">
        {[80, 64, 72, 56, 68].map((w, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-white/[0.07] animate-pulse shrink-0" />
            <div className="h-2.5 rounded bg-white/[0.04] animate-pulse" style={{ width: w }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BacktestStats() {
  const { currentUser } = useAuthStore();
  const cryptoData = useAppStore(s => s.cryptoData);
  // Stable string key — avoids new array reference on every render.
  const symbolsKey = (currentUser?.cryptos ?? ['BTC', 'PAXG']).join(',');
  const symbols    = symbolsKey.split(',');

  const [data, setData]           = useState({});   // { [symbol]: decisions[] }
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState(() => symbols[0] ?? 'BTC');

  // Keep activeTab valid when the symbol list changes (e.g. profile switch).
  const prevSymbolsKey = useRef(symbolsKey);
  useEffect(() => {
    if (prevSymbolsKey.current !== symbolsKey) {
      prevSymbolsKey.current = symbolsKey;
      setActiveTab(cur => (symbols.includes(cur) ? cur : (symbols[0] ?? 'BTC')));
    }
  }, [symbolsKey, symbols]);

  // Fetch all symbols in parallel whenever the symbol list changes.
  useEffect(() => {
    if (!symbols.length) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const results = await Promise.allSettled(
        symbols.map(sym =>
          fetchDecisions(sym, 100).then(res => ({ sym, res }))
        )
      );

      if (cancelled) return;

      const next = {};
      let anyError = false;

      results.forEach((result, i) => {
        const sym = symbols[i];
        if (result.status === 'fulfilled') {
          // API may return { decisions: [] } or a bare array
          const raw = result.value.res;
          next[sym] = Array.isArray(raw) ? raw : (raw?.decisions ?? []);
        } else {
          next[sym] = [];
          anyError = true;
        }
      });

      setData(next);
      if (anyError) setError('Some symbols could not be loaded');
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton />;

  // Ensure activeTab is always valid (guard against stale state on first render
  // after a profile switch before the effect above has run).
  const safeTab = symbols.includes(activeTab) ? activeTab : (symbols[0] ?? 'BTC');
  const currentDecisions = data[safeTab] ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-300">AI Signal History</h3>
        </div>

        {/* Soft error indicator — non-blocking */}
        {error && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400/70">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">{error}</span>
          </div>
        )}
      </div>

      {/* Symbol tabs — only shown when user has multiple cryptos */}
      {symbols.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {symbols.map(sym => {
            const isActive = sym === safeTab;
            const count = (data[sym] ?? []).length;
            return (
              <button
                key={sym}
                onClick={() => setActiveTab(sym)}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150',
                  isActive
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    : 'bg-white/[0.03] text-slate-500 border border-white/[0.05] hover:text-slate-300 hover:border-white/[0.1]',
                ].join(' ')}
              >
                {sym}
                {count > 0 && (
                  <span className={`ml-1.5 tabular text-[10px] ${isActive ? 'text-blue-400/70' : 'text-slate-600'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Stats panel — animated on tab switch */}
      <AnimatePresence mode="wait">
        <motion.div
          key={safeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <SymbolStats decisions={currentDecisions} currentPrice={cryptoData[safeTab]?.price} />
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

export default BacktestStats;
