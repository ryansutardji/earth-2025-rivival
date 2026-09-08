/**
 * Season-pacing helpers shared by the player turn handler and the archetype
 * turn handler. Kept dependency-free (only `config`) so both `turn.ts` and
 * `archetype/applyTurn.ts` can import it without a circular import.
 */

import { config } from "./config";
import type { DifficultyTier } from "./types";

/** AI nations' daily turn budget for this tier — the base pool plus the tier's
 * delta, floored so it never collapses. The player always gets the base. */
export function aiTurnPool(tier: DifficultyTier): number {
  return Math.max(12, config.turnPoolCap + tier.aiTurnPoolDelta);
}

/** First day this nation may attack (combat or missiles). The full first
 * `floor(seasonLengthDays * fraction)` days are blocked — e.g. a 30-day season
 * at fraction 0.2 blocks days 1-6 and unlocks on day 7. `fraction` is the
 * difficulty tier's `attackUnlockFraction` for the AI, or that capped at
 * `config.noAttackDaysFraction` for the player. */
export function attacksUnlockDay(
  seasonLengthDays: number,
  fraction: number = config.noAttackDaysFraction,
): number {
  return Math.floor(seasonLengthDays * Math.max(0, fraction)) + 1;
}

/** Economy-rate scale for a season of this length, relative to the tuned
 * baseline (`pacingBaselineSeasonDays`). A longer season produces resources
 * more slowly, a shorter one more quickly, so the season keeps the same
 * overall shape regardless of how many days it runs. */
export function seasonPacingMult(seasonLengthDays: number): number {
  return config.pacingBaselineSeasonDays / Math.max(1, seasonLengthDays);
}
