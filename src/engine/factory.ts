/** Constructors for `Nation` objects — used by season generation, the store's
 * initial player, and tests. */

import { config } from "./config";
import { DEFAULT_GOVERNMENT } from "./government";
import { SHARED_BASELINE } from "./archetype/templates";
import { zeroTech } from "./tech";
import type {
  Brigade,
  Buildings,
  SuppressedForce,
  EnemyIntel,
  GovernmentId,
  Grudge,
  Military,
  MissileStock,
  Nation,
  ProductionMix,
  TechCategory,
  TechLevels,
} from "./types";

export const zeroMilitary = (): Military => ({ troops: 0, jets: 0, turrets: 0, tanks: 0, spies: 0 });

export const zeroBuildings = (): Buildings => ({
  enterpriseZones: 0,
  residences: 0,
  industrialComplexes: 0,
  militaryBases: 0,
  researchLabs: 0,
  farms: 0,
  oilRigs: 0,
  constructionSites: 0,
});

export const zeroMissiles = (): MissileStock => ({ chemical: 0, cruise: 0, nuclear: 0 });

export const defaultProduction = (): ProductionMix => ({ ...config.defaultProductionMix });

export interface NationOverrides {
  id?: string;
  name?: string;
  isPlayer?: boolean;
  land?: number;
  buildings?: Partial<Buildings>;
  cash?: number;
  population?: number;
  bushels?: number;
  oil?: number;
  military?: Partial<Military>;
  missiles?: Partial<MissileStock>;
  production?: Partial<ProductionMix>;
  tech?: Partial<TechLevels>;
  researchFocus?: TechCategory;
  government?: GovernmentId;
  targetGovernment?: GovernmentId;
  taxRate?: number;
  archetype?: Nation["archetype"];
  ticksAlive?: number;
  defeated?: boolean;
  brigades?: Brigade[];
  defenseSuppression?: SuppressedForce[];
  aiTurnsRemaining?: number;
  intel?: Record<string, EnemyIntel>;
  grudges?: Record<string, Grudge>;
  covertHeat?: number;
  attackFutility?: Record<string, number>;
}

/** Build a nation, filling every field with a sensible default. */
export function makeNation(o: NationOverrides = {}): Nation {
  const base: Nation = {
    id: o.id ?? "n",
    name: o.name ?? "Nation",
    isPlayer: o.isPlayer ?? false,
    land: o.land ?? 1000,
    buildings: { ...zeroBuildings(), ...o.buildings },
    cash: o.cash ?? 20_000,
    population: o.population ?? 3000,
    bushels: o.bushels ?? 6000,
    oil: o.oil ?? 2000,
    military: { ...zeroMilitary(), ...o.military },
    missiles: { ...zeroMissiles(), ...o.missiles },
    production: { ...defaultProduction(), ...o.production },
    tech: { ...zeroTech(), ...o.tech },
    researchFocus: o.researchFocus ?? "business",
    government: o.government ?? DEFAULT_GOVERNMENT,
    ...(o.targetGovernment ? { targetGovernment: o.targetGovernment } : {}),
    taxRate: o.taxRate ?? 0.25,
    ticksAlive: o.ticksAlive ?? 0,
    defeated: o.defeated ?? false,
    brigades: o.brigades ?? [],
    defenseSuppression: o.defenseSuppression ?? [],
    aiTurnsRemaining: o.aiTurnsRemaining ?? config.turnPoolCap,
    intel: o.intel ?? {},
    grudges: o.grudges ?? {},
    covertHeat: o.covertHeat ?? 0,
    attackFutility: o.attackFutility ?? {},
  };
  if (o.archetype !== undefined) base.archetype = o.archetype;
  return base;
}

/** The player's starting nation for a fresh season. Starts from the exact
 * same position as every AI archetype (`SHARED_BASELINE`) — derived stats
 * (population / bushels / oil) mirror how `generateSeason` builds an enemy at
 * `baselineMult` 1.0: population = land × 3, bushels = population × 6, oil is
 * a flat 1500. The player is never difficulty-scaled; the AI roster is. */
export function makePlayerNation(government: GovernmentId = DEFAULT_GOVERNMENT): Nation {
  const population = SHARED_BASELINE.land * 3;
  return makeNation({
    id: "player",
    name: "Your Nation",
    isPlayer: true,
    land: SHARED_BASELINE.land,
    buildings: { ...SHARED_BASELINE.buildings },
    cash: SHARED_BASELINE.cash,
    population,
    bushels: population * 6,
    oil: 1500,
    military: { ...SHARED_BASELINE.military },
    government,
    researchFocus: "business",
    taxRate: 0.25,
  });
}
