import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Usar /tmp en producción (Render), data/ en local
const dbPath = process.env.NODE_ENV === 'production'
  ? '/tmp/decisions.db'
  : path.join(__dirname, '../../data/decisions.db');

let db = null;

// Inicializa la base de datos y crea las tablas si no existen
export function initDatabase() {
  // Crear directorio si no existe (solo para local)
  if (process.env.NODE_ENV !== 'production') {
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
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
