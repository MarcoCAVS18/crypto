// Capa de acceso a Firestore para operaciones del portfolio.
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, query, orderBy, limit, where, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COL = 'portfolio_operations';

// ── Validación de config ─────────────────────────────────────────────────────
function checkConfig() {
  if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
    throw new Error(
      'Firebase no configurado: agregá las variables VITE_FIREBASE_* en Netlify y redesplegá.'
    );
  }
}

// ── Timeout para evitar promesas colgadas ────────────────────────────────────
// Firestore no rechaza si no puede conectar — cuelga indefinidamente.
// Con esto, después de 12 s muestra un error claro en vez de quedarse en "Guardando".
function withTimeout(promise, ms = 12000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('No se pudo conectar a Firestore. Verificá que las variables de entorno estén configuradas y que las reglas de seguridad permitan escritura.')),
      ms
    )
  );
  return Promise.race([promise, timeout]);
}

// ── Agregar operación ────────────────────────────────────────────────────────
export async function fsAddOperation(op) {
  checkConfig();
  const docRef = await withTimeout(
    addDoc(collection(db, COL), {
      date:       op.date,
      symbol:     op.symbol.toUpperCase(),
      type:       op.type.toUpperCase(),
      amount_usd: Number(op.amount_usd),
      price:      Number(op.price),
      units:      Number(op.units),
      fee:        Number(op.fee) || 0,
      exchange:   op.exchange || 'Binance',
      notes:      op.notes || '',
      created_at: serverTimestamp(),
    })
  );
  return docRef.id;
}

// ── Obtener operaciones ──────────────────────────────────────────────────────
export async function fsGetOperations(symbolFilter = null, limitCount = 200) {
  checkConfig();
  let q;
  if (symbolFilter) {
    q = query(
      collection(db, COL),
      where('symbol', '==', symbolFilter.toUpperCase()),
      orderBy('date', 'desc'),
      limit(limitCount)
    );
  } else {
    q = query(
      collection(db, COL),
      orderBy('date', 'desc'),
      limit(limitCount)
    );
  }
  const snap = await withTimeout(getDocs(q));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Eliminar operación ────────────────────────────────────────────────────────
export async function fsDeleteOperation(id) {
  checkConfig();
  await withTimeout(deleteDoc(doc(db, COL, id)));
}
