// Versiones de los modelos/políticas en un solo lugar: se muestran en /api/health/deep y sirven para saber, al mirar un
// registro (decisión, snapshot, resultado), con qué reglas se produjo. Solo lee constantes ya versionadas en su módulo.

import { DECISION_MODEL_VERSION } from '../services/decisionLog.js';
import { SNAPSHOT_MODEL_VERSION } from '../services/snapshot.js';
import { DCA_POLICY } from '../services/dcaPolicy.js';
import { EVENT_RULES } from '../services/eventRisk.js';
import { EXIT_RULES } from '../services/exitPolicy.js';
import { DEFAULT_COSTS } from '../services/costModel.js';
import { AI_WEIGHT, MODE_THRESHOLD, MODE_EXIT_THRESHOLD } from '../services/goldMarketMode.js';

export function getVersions() {
  return {
    decision: DECISION_MODEL_VERSION,
    snapshot: SNAPSHOT_MODEL_VERSION,
    dcaPolicy: DCA_POLICY.version,
    revision: process.env.K_REVISION ?? null,          // revisión de Cloud Functions/Run en producción
    parameters: {
      aiWeight: AI_WEIGHT, modeEnter: MODE_THRESHOLD, modeExit: MODE_EXIT_THRESHOLD,
      dcaTilt: DCA_POLICY.tilt, dcaBaseFraction: DCA_POLICY.baseFraction,
      eventRules: EVENT_RULES, exitRules: EXIT_RULES, defaultCosts: DEFAULT_COSTS
    }
  };
}
