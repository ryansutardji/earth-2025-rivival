/**
 * The decision engine — the one genuinely new system in the project, kept
 * deliberately small and isolated because it needs the most tuning.
 *
 * Each turn: roll a weighted-random selection against the archetype's
 * `{action: weight}` table. No look-ahead, no board evaluation.
 */

import type { Rng } from "../types";
import { ARCHETYPE_ACTIONS, type ArchetypeAction, type ArchetypeTemplate } from "./templates";

/**
 * Effective weights for this roll: the base table with the hostile actions
 * (`attackPlayer`, `covertPlayer`) scaled by the active tier's aggression skew.
 */
export function effectiveWeights(
  template: ArchetypeTemplate,
  aggressionSkew: number,
): Record<ArchetypeAction, number> {
  const base = template.decisionTable;
  return {
    attackPlayer: base.attackPlayer * aggressionSkew,
    covertPlayer: base.covertPlayer * aggressionSkew,
    buildMilitary: base.buildMilitary,
    buildEconomy: base.buildEconomy,
    explore: base.explore,
  };
}

/**
 * Weighted-random pick. A zero (or negative) weight is never selected. Falls
 * back to the last positive-weight action if float rounding overshoots.
 */
export function decideAction(
  template: ArchetypeTemplate,
  aggressionSkew: number,
  rng: Rng,
): ArchetypeAction {
  const weights = effectiveWeights(template, aggressionSkew);
  const total = ARCHETYPE_ACTIONS.reduce((sum, a) => sum + Math.max(0, weights[a]), 0);

  // Degenerate table (every weight 0) — do the harmless thing.
  if (total <= 0) return "buildEconomy";

  let roll = rng() * total;
  let last: ArchetypeAction = "buildEconomy";
  for (const action of ARCHETYPE_ACTIONS) {
    const w = Math.max(0, weights[action]);
    if (w <= 0) continue;
    last = action;
    roll -= w;
    if (roll < 0) return action;
  }
  return last;
}
