import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prioridad: DATABASE_PATH env var → ./data/decisions.db (relativo al proceso)
// Nunca usar /tmp: es efímero en Render y otros servicios cloud.
// Para Render con disco persistente: DATABASE_PATH=/data/decisions.db
const dbPath = process.env.DATABASE_PATH
  || path.join(process.cwd(), 'data', 'decisions.db');

let db = null;

// Inicializa la base de datos y crea las tablas si no existen
export function initDatabase() {
  // Crear directorio si no existe (siempre, en cualquier entorno)
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Crear tabla de decisiones
  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      market_mode TEXT NOT NULL,
      decision TEXT NOT NULL,
      cash_percent INTEGER,
      user_mode TEXT,
      reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_timestamp ON decisions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_symbol ON decisions(symbol);

    CREATE TABLE IF NOT EXISTS portfolio_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      price REAL NOT NULL,
      units REAL NOT NULL,
      fee REAL DEFAULT 0,
      exchange TEXT DEFAULT 'Binance',
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON portfolio_operations(symbol);
    CREATE INDEX IF NOT EXISTS idx_portfolio_date ON portfolio_operations(date);
  `);

  return db;
}

// Obtiene la instancia de la base de datos
export function getDatabase() {
  if (!db) {
    throw new Error('Base de datos no inicializada. Llama a initDatabase() primero.');
  }
  return db;
}

// Guarda una decisión en la base de datos
export function saveDecision(decision) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO decisions (symbol, price, market_mode, decision, cash_percent, user_mode, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  return stmt.run(
    decision.symbol,
    decision.price,
    decision.marketMode,
    decision.decision,
    decision.cashPercent,
    decision.userMode,
    decision.reason
  );
}

// Obtiene las últimas decisiones
export function getDecisions(limit = 20) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM decisions
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(limit);
}

// ── Portfolio operations ───────────────────────────────────────────────────────

export function addPortfolioOperation(op) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO portfolio_operations (date, symbol, type, amount_usd, price, units, fee, exchange, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    op.date,
    op.symbol.toUpperCase(),
    op.type.toUpperCase(),
    op.amount_usd,
    op.price,
    op.units,
    op.fee || 0,
    op.exchange || 'Binance',
    op.notes || null
  );
}

export function getPortfolioOperations(symbol = null, limit = 100) {
  const db = getDatabase();
  if (symbol) {
    return db.prepare(`
      SELECT * FROM portfolio_operations WHERE symbol = ?
      ORDER BY date DESC, id DESC LIMIT ?
    `).all(symbol.toUpperCase(), limit);
  }
  return db.prepare(`
    SELECT * FROM portfolio_operations
    ORDER BY date DESC, id DESC LIMIT ?
  `).all(limit);
}

export function deletePortfolioOperation(id) {
  const db = getDatabase();
  return db.prepare('DELETE FROM portfolio_operations WHERE id = ?').run(id);
}

export function getPortfolioSummary() {
  const db = getDatabase();
  const ops = db.prepare('SELECT * FROM portfolio_operations ORDER BY date ASC').all();

  // Calcular balance por símbolo
  const bySymbol = {};
  for (const op of ops) {
    if (!bySymbol[op.symbol]) {
      bySymbol[op.symbol] = { symbol: op.symbol, units: 0, invested: 0, withdrawn: 0, fees: 0, operations: 0 };
    }
    const s = bySymbol[op.symbol];
    s.operations += 1;
    s.fees += op.fee || 0;
    if (op.type === 'BUY') {
      s.units += op.units;
      s.invested += op.amount_usd;
    } else if (op.type === 'SELL') {
      s.units -= op.units;
      s.withdrawn += op.amount_usd;
    }
  }

  return Object.values(bySymbol).map(s => ({
    ...s,
    units: Math.max(0, s.units),
    netInvested: s.invested - s.withdrawn,
    avgBuyPrice: s.invested > 0 && s.units > 0 ? (s.invested - s.withdrawn) / s.units : 0
  }));
}
