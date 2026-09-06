/**
 * Difficulty is data. Each tier is fed unchanged into the same archetype /
 * generation code — there are no difficulty-specific code paths. The slice ships
 * three points on what will become a longer ladder; adding more is an edit here.
 */

import type { DifficultyTier } from "../engine/types";

export const DIFFICULTY_TIERS: DifficultyTier[] = [
  {
    id: "recruit",
    label: "I — Recruit",
    growthMultiplier: 0.7,
    baselineMult: 0.75,
    aggressionSkew: 0.6,
  },
  {
    id: "veteran",
    label: "II — Veteran",
    growthMultiplier: 1.0,
    baselineMult: 1.0,
    aggressionSkew: 1.0,
  },
  {
    id: "warlord",
    label: "III — Warlord",
    growthMultiplier: 1.4,
    baselineMult: 1.35,
    aggressionSkew: 1.6,
  },
];

export const DEFAULT_TIER_ID = "recruit";

export function getTier(id: string): DifficultyTier {
  return DIFFICULTY_TIERS.find((t) => t.id === id) ?? DIFFICULTY_TIERS[1]!;
}
