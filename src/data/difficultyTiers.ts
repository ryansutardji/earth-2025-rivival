/**
 * Difficulty is data. Each tier is fed unchanged into the same archetype /
 * generation code — there are no difficulty-specific code paths.
 *
 * Three levers, all about *tempo and pressure* — never a bigger or inherently
 * meaner AI (every tier starts the AI at the player's size with the same base
 * decision weights):
 *
 *  - `attackUnlockFraction` — when combat opens. AI always uses it; the player
 *    uses `min(it, config.noAttackDaysFraction)` (= 0.20, the Veteran anchor).
 *  - `seasonHeatMaxMult`    — how hard late-game aggression ramps.
 *  - `aiTurnPoolDelta`      — AI actions per day, relative to the base 50.
 */

import type { DifficultyTier } from "../engine/types";

export const DIFFICULTY_TIERS: DifficultyTier[] = [
  { id: "militia", label: "I — Militia", attackUnlockFraction: 0.40, seasonHeatMaxMult: 1.6, aiTurnPoolDelta: -8 },
  { id: "recruit", label: "II — Recruit", attackUnlockFraction: 0.35, seasonHeatMaxMult: 1.8, aiTurnPoolDelta: -6 },
  { id: "regular", label: "III — Regular", attackUnlockFraction: 0.30, seasonHeatMaxMult: 2.0, aiTurnPoolDelta: -4 },
  { id: "seasoned", label: "IV — Seasoned", attackUnlockFraction: 0.25, seasonHeatMaxMult: 2.2, aiTurnPoolDelta: -2 },
  { id: "veteran", label: "V — Veteran", attackUnlockFraction: 0.20, seasonHeatMaxMult: 2.4, aiTurnPoolDelta: 0 },
  { id: "hardened", label: "VI — Hardened", attackUnlockFraction: 0.15, seasonHeatMaxMult: 2.7, aiTurnPoolDelta: 2 },
  { id: "elite", label: "VII — Elite", attackUnlockFraction: 0.10, seasonHeatMaxMult: 3.0, aiTurnPoolDelta: 4 },
  { id: "warlord", label: "VIII — Warlord", attackUnlockFraction: 0.06, seasonHeatMaxMult: 3.3, aiTurnPoolDelta: 6 },
  { id: "conqueror", label: "IX — Conqueror", attackUnlockFraction: 0.03, seasonHeatMaxMult: 3.7, aiTurnPoolDelta: 8 },
  { id: "apex", label: "X — Apex", attackUnlockFraction: 0.0, seasonHeatMaxMult: 4.2, aiTurnPoolDelta: 10 },
];

export const DEFAULT_TIER_ID = "recruit";

export function getTier(id: string): DifficultyTier {
  return (
    DIFFICULTY_TIERS.find((t) => t.id === id) ??
    DIFFICULTY_TIERS.find((t) => t.id === "veteran") ??
    DIFFICULTY_TIERS[0]!
  );
}
