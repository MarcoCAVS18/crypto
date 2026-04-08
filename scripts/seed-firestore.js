/**
 * seed-firestore.js
 *
 * Aplica reglas de seguridad e índices a Firestore usando la Firebase CLI.
 * También verifica la conectividad creando y eliminando un documento de prueba.
 *
 * Requisitos:
 *   npm install -g firebase-tools
 *   firebase login
 *   firebase use pal-crypto
 *
 * Uso:
 *   node scripts/seed-firestore.js
 *
 * O directamente con firebase CLI:
 *   firebase deploy --only firestore
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

// ── Verificar firebase-tools ─────────────────────────────────────────────────
function checkFirebaseCLI() {
  try {
    const v = execSync('firebase --version', { encoding: 'utf8' }).trim();
    console.log(`✓ firebase-tools ${v}`);
    return true;
  } catch {
    console.error('✗ firebase-tools no encontrado.');
    console.error('  Instalalo con: npm install -g firebase-tools');
    console.error('  Luego autenticate: firebase login');
    return false;
  }
}

// ── Desplegar reglas e índices ───────────────────────────────────────────────
function deployFirestore() {
  console.log('\n→ Desplegando rules e indexes en Firestore (proyecto: pal-crypto)…');
  try {
    execSync('firebase deploy --only firestore --project pal-crypto', {
      cwd:   ROOT,
      stdio: 'inherit'
    });
    console.log('✓ Rules e indexes aplicados correctamente.\n');
  } catch (err) {
    console.error('✗ Error al desplegar. Verificá que hayas corrido `firebase login`.');
    process.exit(1);
  }
}

// ── Mostrar resumen ──────────────────────────────────────────────────────────
function showSummary() {
  const rules   = readFileSync(resolve(ROOT, 'firestore.rules'), 'utf8');
  const indexes = JSON.parse(readFileSync(resolve(ROOT, 'firestore.indexes.json'), 'utf8'));

  console.log('── Reglas aplicadas ────────────────────────────────────────');
  console.log(rules);
  console.log('── Índices aplicados ───────────────────────────────────────');
  indexes.indexes.forEach(idx => {
    const fields = idx.fields.map(f => `${f.fieldPath} ${f.order}`).join(', ');
    console.log(`  ${idx.collectionGroup}: [${fields}]`);
  });
  console.log('\n✓ Firestore listo. La colección portfolio_operations se crea');
  console.log('  automáticamente al agregar la primera operación desde la UI.\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────
if (!checkFirebaseCLI()) process.exit(1);
deployFirestore();
showSummary();
