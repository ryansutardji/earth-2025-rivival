/**
 * The eight Earth Empires governments and their effects, taken from the wiki
 * Manage page. 1.0 is neutral. Monarchy is the baseline (all-neutral) government
 * and the only one you can leave with no penalty.
 */

import type { GovernmentId } from "./types";

export interface GovernmentEffects {
  id: GovernmentId;
  label: string;
  blurb: string;
  /** Per-capita income. */
  pciMult: number;
  /** Scales the ceiling of every tech area (Democracy +10%, Theocracy −35%). */
  maxTechMult: number;
  /** Tech points earned per turn (Communism "tech effectiveness" +20%). */
  techRateMult: number;
  /** Industrial Complex unit output (Communism +35%). */
  industrialMult: number;
  /** Bushel production (Fascism +15%). */
  foodMult: number;
  /** Oil production (Fascism +75%). */
  oilMult: number;
  /** Battlefield strength, offence and defence (Republic −10%, Dictatorship +25%). */
  militaryStrengthMult: number;
  /** Per-turn military upkeep + private-market buy price (Theocracy −20%, Tyranny −10%). */
  militaryCostMult: number;
  /** Land / resources captured on this nation's own attacks (Tyranny +20%). */
  attackGainsMult: number;
  /** Buildings captured on a won land attack (Dictatorship +32%). */
  buildingCaptureMult: number;
  /** Buildings-per-turn (Theocracy +40%, Dictatorship −30%). */
  buildRateMult: number;
  /** Additive bonus to spy-op success/defence factor (Dictatorship +0.30). */
  spyEffectivenessBonus: number;
  /** Population ceiling (Theocracy +50%, Fascism −15%). */
  maxPopMult: number;
  /** Public-market commission (Democracy 0, Communism 0.10, else 0.06). */
  marketCommission: number;
  /** Turns a Standard/Planned strike costs (Democracy 3, Tyranny 1, else 2). */
  turnsToAttack: number;
  /** Republic uses the higher explore-rate table. */
  usesRepublicExplore: boolean;
}

const base = (o: Partial<GovernmentEffects>): Omit<GovernmentEffects, "id" | "label" | "blurb"> => ({
  pciMult: 1,
  maxTechMult: 1,
  techRateMult: 1,
  industrialMult: 1,
  foodMult: 1,
  oilMult: 1,
  militaryStrengthMult: 1,
  militaryCostMult: 1,
  attackGainsMult: 1,
  buildingCaptureMult: 1,
  buildRateMult: 1,
  spyEffectivenessBonus: 0,
  maxPopMult: 1,
  marketCommission: 0.06,
  turnsToAttack: 2,
  usesRepublicExplore: false,
  ...o,
});

export const GOVERNMENTS: Record<GovernmentId, GovernmentEffects> = {
  monarchy: {
    id: "monarchy",
    label: "Monarchy",
    blurb: "The default. No bonuses, no penalties — and free to switch away from.",
    ...base({}),
  },
  democracy: {
    id: "democracy",
    label: "Democracy",
    blurb: "+10% tech ceiling and 0% market commission, but 3 turns per attack.",
    ...base({ maxTechMult: 1.1, marketCommission: 0, turnsToAttack: 3 }),
  },
  republic: {
    id: "republic",
    label: "Republic",
    blurb: "+20% explore rate and +20% per-capita income; −10% military strength.",
    ...base({ pciMult: 1.2, militaryStrengthMult: 0.9, usesRepublicExplore: true }),
  },
  theocracy: {
    id: "theocracy",
    label: "Theocracy",
    blurb: "−20% military costs, +40% build rate, +50% population — but −35% tech ceiling.",
    ...base({ militaryCostMult: 0.8, buildRateMult: 1.4, maxPopMult: 1.5, maxTechMult: 0.65 }),
  },
  communism: {
    id: "communism",
    label: "Communism",
    blurb: "+35% industrial output and +20% tech effectiveness; 10% market commission.",
    ...base({ industrialMult: 1.35, techRateMult: 1.2, marketCommission: 0.1 }),
  },
  dictatorship: {
    id: "dictatorship",
    label: "Dictatorship",
    blurb: "+25% military strength, +30 spy effectiveness, +32% building capture; −30% build rate.",
    ...base({ militaryStrengthMult: 1.25, spyEffectivenessBonus: 0.3, buildingCaptureMult: 1.32, buildRateMult: 0.7 }),
  },
  tyranny: {
    id: "tyranny",
    label: "Tyranny",
    blurb: "1 turn per attack, +20% attack gains, −10% upkeep; −25% per-capita income.",
    ...base({ attackGainsMult: 1.2, militaryCostMult: 0.9, pciMult: 0.75, turnsToAttack: 1 }),
  },
  fascism: {
    id: "fascism",
    label: "Fascism",
    blurb: "Resource state: +15% bushels, +75% oil; −10% per-capita income, −15% population.",
    ...base({ foodMult: 1.15, oilMult: 1.75, pciMult: 0.9, maxPopMult: 0.85 }),
  },
};

export const GOVERNMENT_IDS = Object.keys(GOVERNMENTS) as GovernmentId[];

export const DEFAULT_GOVERNMENT: GovernmentId = "monarchy";

export function gov(id: GovernmentId): GovernmentEffects {
  return GOVERNMENTS[id] ?? GOVERNMENTS.monarchy;
}
