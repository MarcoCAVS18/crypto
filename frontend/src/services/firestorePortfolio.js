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
      'Firebase no configurado: agregá las variables VITE_FIREBASE_* en el .env y redesplegá.'
    );
  }
}

// ── Timeout para evitar promesas colgadas ────────────────────────────────────
// Firestore no rechaza si no puede conectar — cuelga indefinidamente.
// Con esto, después de 12 s muestra un error claro en vez de quedarse en "Guardando".
function withTimeout(promise, ms = 30000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Timeout de conexión con Firestore. Si tenés mala señal, la operación puede haberse guardado igual — actualizá el portfolio para verificar.')),
      ms
    )
  );
  return Promise.race([promise, timeout]);
}

// ── Agregar operación ────────────────────────────────────────────────────────
export async function fsAddOperation(op, userId) {
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
      userId:     userId || 'marco',
      created_at: serverTimestamp(),
    })
  );
  return docRef.id;
}

// ── Obtener operaciones ──────────────────────────────────────────────────────
export async function fsGetOperations(symbolFilter = null, userId = null, limitCount = 500) {
  checkConfig();
  let q;
  if (userId && userId !== 'marco') {
    // Usuarios no-legacy: filtro server-side por userId (no necesita composite index)
    // Ordenamos client-side después del fetch
    q = query(
      collection(db, COL),
      where('userId', '==', userId),
      limit(limitCount)
    );
  } else {
    // Marco / legacy: trae todos ordenados y filtra client-side (ops sin userId = legacy de Marco)
    q = query(
      collection(db, COL),
      orderBy('date', 'desc'),
      limit(limitCount)
    );
  }

  const snap = await withTimeout(getDocs(q));
  let ops = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Filtro y orden client-side
  if (userId === 'marco') {
    ops = ops.filter(op => !op.userId || op.userId === 'marco');
  }
  // Para usuarios no-legacy, ya están filtrados server-side — solo ordenar
  if (userId && userId !== 'marco') {
    ops.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  // Si no hay userId: sin filtro (backward compat)

  if (symbolFilter) {
    ops = ops.filter(op => op.symbol === symbolFilter.toUpperCase());
  }

  return ops;
}

// ── Eliminar operación ────────────────────────────────────────────────────────
export async function fsDeleteOperation(id) {
  checkConfig();
  await withTimeout(deleteDoc(doc(db, COL, id)));
}
