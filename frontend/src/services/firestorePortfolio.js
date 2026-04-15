// Capa de acceso a Firestore para operaciones del portfolio.
// Reemplaza las llamadas al backend (/api/portfolio/*).
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, query, orderBy, limit, where, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COL = 'portfolio_operations';

// ── Agregar operación ────────────────────────────────────────────────────────

export async function fsAddOperation(op, userId) {
  const docRef = await addDoc(collection(db, COL), {
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
  });
  return docRef.id;
}

// ── Obtener operaciones ──────────────────────────────────────────────────────

export async function fsGetOperations(symbolFilter = null, userId = null, limitCount = 200) {
  // Siempre traemos todas las operaciones y filtramos client-side por userId
  const q = query(
    collection(db, COL),
    orderBy('date', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  let ops = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Filtro por usuario
  if (userId === 'marco') {
    // Operaciones sin userId (legacy) pertenecen a Marco
    ops = ops.filter(op => !op.userId || op.userId === 'marco');
  } else if (userId) {
    ops = ops.filter(op => op.userId === userId);
  }
  // Si no hay userId: sin filtro (backward compat)

  // Filtro por símbolo (post userId)
  if (symbolFilter) {
    ops = ops.filter(op => op.symbol === symbolFilter.toUpperCase());
  }

  return ops;
}

// ── Eliminar operación ────────────────────────────────────────────────────────

export async function fsDeleteOperation(id) {
  await deleteDoc(doc(db, COL, id));
}
