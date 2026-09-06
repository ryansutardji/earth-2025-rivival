/**
 * Season-pacing helpers shared by the player turn handler and the archetype
 * turn handler. Kept dependency-free (only `config`) so both `turn.ts` and
 * `archetype/applyTurn.ts` can import it without a circular import.
 */

import { config } from "./config";

/** First day attacking (combat or missiles) is allowed. Before this, every
 * nation is in a build-up window and no one can throw a punch. The full first
 * `floor(seasonLengthDays * noAttackDaysFraction)` days are blocked — e.g. a
 * 30-day season blocks days 1-6 entirely and unlocks on day 7. */
export function attacksUnlockDay(seasonLengthDays: number): number {
  return Math.floor(seasonLengthDays * config.noAttackDaysFraction) + 1;
}

/** Economy-rate scale for a season of this length, relative to the tuned
 * baseline (`pacingBaselineSeasonDays`). A longer season produces resources
 * more slowly, a shorter one more quickly, so the season keeps the same
 * overall shape regardless of how many days it runs. */
export function seasonPacingMult(seasonLengthDays: number): number {
  return config.pacingBaselineSeasonDays / Math.max(1, seasonLengthDays);
}
