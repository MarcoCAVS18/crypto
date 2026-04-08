// Capa de acceso a Firestore para operaciones del portfolio.
// Reemplaza las llamadas al backend (/api/portfolio/*).
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, query, orderBy, limit, where, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COL = 'portfolio_operations';

// ── Agregar operación ────────────────────────────────────────────────────────

export async function fsAddOperation(op) {
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
    created_at: serverTimestamp(),
  });
  return docRef.id;
}

// ── Obtener operaciones ──────────────────────────────────────────────────────

export async function fsGetOperations(symbolFilter = null, limitCount = 200) {
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
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Eliminar operación ────────────────────────────────────────────────────────

export async function fsDeleteOperation(id) {
  await deleteDoc(doc(db, COL, id));
}
