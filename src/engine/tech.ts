/**
 * Research: the eleven Earth Empires tech areas, their accrued-points → effect
 * curve, and the per-area multipliers other systems read.
 *
 * Each area runs from a base value to a ceiling: `base + (max - base) * (1 -
 * e^(-points / scale))`. The ceiling is scaled by the government's `maxTechMult`
 * (Democracy +10%, Theocracy −35%). This mirrors the wiki's Base % / Maximum
 * Tech % columns.
 */

import { config } from "./config";
import { gov } from "./government";
import type { Nation, TechCategory, TechLevels } from "./types";
import { TECH_CATEGORIES } from "./types";

export const zeroTech = (): TechLevels =>
  Object.fromEntries(TECH_CATEGORIES.map((c) => [c, 0])) as TechLevels;

/**
 * Effect value for a tech area given accumulated points and the nation's
 * government. 1.0 means "no effect"; >1 or <1 per the area's direction.
 */
export function techValue(n: Nation, category: TechCategory): number {
  const spec = config.techBonus[category];
  const maxTech = gov(n.government).maxTechMult;
  // Ceiling moves toward/away from the neutral 1.0 as maxTech scales it.
  const ceiling = 1 + (spec.max - 1) * maxTech;
  const points = Math.max(0, n.tech[category]);
  return spec.base + (ceiling - spec.base) * (1 - Math.exp(-points / spec.scale));
}

/** Multiplier on offensive & defensive strength (Weapons tech, ≥ 1). */
export const weaponsTechMult = (n: Nation): number => techValue(n, "weapons");

/** Multiplier on per-turn military upkeep & private-market buy price (Military tech, ≤ 1). */
export const militaryCostTechMult = (n: Nation): number => techValue(n, "military");

/** Multiplier reducing your unit losses when defending (Medical tech, ≤ 1). */
export const medicalTechMult = (n: Nation): number => techValue(n, "medical");

/** Multiplier on per-capita income ceiling (Business tech, ≥ 1). */
export const businessTechMult = (n: Nation): number => techValue(n, "business");

/** Multiplier on population ceiling (Residential tech, ≥ 1). */
export const residentialTechMult = (n: Nation): number => techValue(n, "residential");

/** Multiplier on bushel output ceiling (Agricultural tech, ≥ 1). */
export const agriculturalTechMult = (n: Nation): number => techValue(n, "agricultural");

/** Multiplier on land/resource gains from Standard/Planned strikes (Military Strategy, ≥ 1). */
export const strategyTechMult = (n: Nation): number => techValue(n, "militaryStrategy");

/** Multiplier on Industrial Complex output (Industrial tech, ≥ 1). */
export const industrialTechMult = (n: Nation): number => techValue(n, "industrial");

/** Multiplier on covert-op success & counter-intel (Spy tech, ≥ 1). */
export const spyTechMult = (n: Nation): number => techValue(n, "spy");

/** Missile production rate per turn (Warfare tech; small). */
export const warfareTechRate = (n: Nation): number => techValue(n, "warfare");

/** Chance [0,1] an incoming missile is intercepted (SDI tech). */
export const sdiTechChance = (n: Nation): number => Math.min(0.95, techValue(n, "sdi"));
