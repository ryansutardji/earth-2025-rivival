/**
 * Archetype templates: a personality is a weighted decision table + a real
 * economic recipe (what to build, what to buy, in what order) + spend
 * fractions. Archetypes run the exact same economy and the exact same real
 * player-facing actions as the player — no made-up growth ceiling, no free
 * instant stat nudges. "Personality" is entirely about *what* an archetype
 * chooses to do with its own real cash and turns, not a special-cased shortcut.
 *
 * Every archetype (and the human player, via `makePlayerNation`) now starts
 * from the *same* baseline — see `SHARED_BASELINE`. Difficulty scales the AI
 * roster up from there via `tier.baselineMult`; the player is never scaled.
 */

import type { AttackType, Buildings, GovernmentId, Military, ProductionMix, PurchasableUnit } from "../types";

export type ArchetypeAction =
  | "attackPlayer"
  | "covertPlayer"
  | "buildMilitary"
  | "buildEconomy"
  | "explore";

export const ARCHETYPE_ACTIONS: readonly ArchetypeAction[] = [
  "attackPlayer",
  "covertPlayer",
  "buildMilitary",
  "buildEconomy",
  "explore",
];

/** How an archetype splits its built acres across the 8 structure types (weights). */
export type BuildingMix = Record<keyof Buildings, number>;
/** How an archetype splits *purchases* across the 4 buyable unit types (weights). */
export type UnitMix = Record<PurchasableUnit, number>;

export interface ArchetypeTemplate {
  id: "raider" | "economic" | "turtle" | "balanced";
  label: string;
  blurb: string;
  /** Target government — adopted via a mandatory first `setGovernment` action
   * (every nation starts Monarchy, which is free to leave; see applyTurn.ts). */
  government: GovernmentId;
  /** Relative selection weights; a weight of 0 disables that action. */
  decisionTable: Record<ArchetypeAction, number>;
  /** Relative weights for which attack type to use when there's no decent
   * intel on the target to make a smarter choice (see applyTurn.ts). */
  attackTypeMix: Partial<Record<AttackType, number>>;
  /** Factory output split (5-way, includes spies) — set once at creation,
   * not an ongoing decision; independent from `targetMix` below. */
  production: ProductionMix;
  /** Target recipe for *purchased* military (4-way, spies excluded — they
   * can't be bought). Buying prioritizes whichever type is furthest under
   * its target share; `buyPriority` only breaks ties once the recipe's met. */
  targetMix: UnitMix;
  buyPriority: readonly PurchasableUnit[];
  /** Target recipe for built acres (8-way), same deficit-first-then-priority
   * logic as `targetMix`/`buyPriority`. */
  buildingMix: BuildingMix;
  buildPriority: readonly (keyof Buildings)[];
  /** Share of cash committed per "buy military" decision (one combined
   * ceiling for the whole decision — see `buyMilitaryTowardMix`). */
  militarySpendFraction: number;
  /** Share of cash committed per "build economy" decision. */
  buildSpendFraction: number;
  baseline: {
    land: number;
    cash: number;
    military: Military;
    buildings: Buildings;
  };
}

const buildingMix = (o: Partial<BuildingMix>): BuildingMix => ({
  enterpriseZones: 0, residences: 0, industrialComplexes: 0, farms: 0,
  oilRigs: 0, researchLabs: 0, militaryBases: 0, constructionSites: 0, ...o,
});

const zeroBuild = (): Buildings => buildingMix({});
const zeroMil = (): Military => ({ troops: 0, turrets: 0, jets: 0, tanks: 0, spies: 0 });

// ---------------------------------------------------------------------------
// Shared defaults. Balanced / Economic / Turtle all still run on these exact
// numbers — Balanced is the reference point every calibrated archetype is
// tuned against. Only Raider is individually calibrated so far; see
// docs/archetype-calibration.md. `id` / `label` / `blurb` / `government`
// differ per archetype; `baseline` is now shared (see SHARED_BASELINE).
// ---------------------------------------------------------------------------

const SHARED_DECISION_TABLE: ArchetypeTemplate["decisionTable"] = {
  attackPlayer: 2,
  covertPlayer: 1,
  buildMilitary: 6,
  buildEconomy: 3,
  // Only ever in play once empty land drops to `archetypeExploreLandFraction`
  // of total (see applyTurn.ts) — otherwise the affordability mask zeroes it.
  // Matched to buildEconomy so the two roughly balance: explore adds land,
  // build consumes it, keeping empty acres hovering near the threshold.
  explore: 3,
};

const SHARED_ATTACK_TYPE_MIX: ArchetypeTemplate["attackTypeMix"] = {
  standard: 0.7,
  guerilla: 0.2,
  bombing: 0.1,
};

/** Even across everything — factories produce a bit of all 5 unit types. */
const SHARED_PRODUCTION: ProductionMix = { troops: 20, jets: 20, turrets: 20, tanks: 20, spies: 20 };

/** Even across the 4 buyable types — no lean, matches "Balanced" exactly. */
const SHARED_TARGET_MIX: UnitMix = { troops: 25, jets: 25, turrets: 25, tanks: 25 };
const SHARED_BUY_PRIORITY: readonly PurchasableUnit[] = ["troops", "jets", "turrets", "tanks"];

/** Construction Sites front-loaded (raises build-rate for everything that
 * follows); the rest split evenly. */
const SHARED_BUILDING_MIX: BuildingMix = buildingMix({
  constructionSites: 30,
  enterpriseZones: 10, residences: 10, industrialComplexes: 10,
  militaryBases: 10, researchLabs: 10, farms: 10, oilRigs: 10,
});
/** "Keep the lights on" ordering: necessities before growth extras. */
const SHARED_BUILD_PRIORITY: readonly (keyof Buildings)[] = [
  "farms", "oilRigs", "enterpriseZones", "residences",
  "industrialComplexes", "researchLabs", "militaryBases", "constructionSites",
];

/** Cash committed per buy/build decision. Symmetric by default; Raider spends
 * harder on military (see its template). */
const DEFAULT_MILITARY_SPEND_FRACTION = 0.5;
const DEFAULT_BUILD_SPEND_FRACTION = 0.5;

/** The one starting position — used by every archetype at `baselineMult` 1.0
 * and by `makePlayerNation`. */
const SHARED_BASELINE: ArchetypeTemplate["baseline"] = {
  land: 900,
  cash: 8000,
  military: { ...zeroMil(), troops: 180, turrets: 180, jets: 80, tanks: 20 },
  buildings: { ...zeroBuild(), enterpriseZones: 30, residences: 22, industrialComplexes: 22, farms: 16, oilRigs: 10, researchLabs: 8, militaryBases: 4, constructionSites: 4 },
};

// ---------------------------------------------------------------------------
// Raider — calibrated. Aggressive, offense-focused land-grabber. See
// docs/archetype-calibration.md "Raider — calibrated values".
// ---------------------------------------------------------------------------

const RAIDER_DECISION_TABLE: ArchetypeTemplate["decisionTable"] = {
  attackPlayer: 4,
  covertPlayer: 1,
  buildMilitary: 5,
  buildEconomy: 2,
  explore: 3,
};

/** Standard-heavy land grab with a splash of Planned; bombing (jets vs
 * turrets, captures nothing) all but dropped. */
const RAIDER_ATTACK_TYPE_MIX: ArchetypeTemplate["attackTypeMix"] = {
  standard: 0.75,
  planned: 0.15,
  guerilla: 0.05,
  bombing: 0.05,
};

/** 75% to fighting units; turrets halved; spies trimmed but not gutted so it
 * still scouts a little. */
const RAIDER_PRODUCTION: ProductionMix = { troops: 25, jets: 25, turrets: 10, tanks: 25, spies: 15 };

/** Cheap effective offense (troops/jets) carries it; tanks modest to stay
 * affordable; turrets minimal. */
const RAIDER_TARGET_MIX: UnitMix = { troops: 35, jets: 35, turrets: 10, tanks: 20 };
const RAIDER_BUY_PRIORITY: readonly PurchasableUnit[] = ["troops", "jets", "tanks", "turrets"];

/** Industrial complexes as the passive-army engine; military bases up to
 * relieve the upkeep brake; near-zero pure-economy; labs 0 (archetypes don't
 * steer research focus). */
const RAIDER_BUILDING_MIX: BuildingMix = buildingMix({
  industrialComplexes: 30,
  constructionSites: 20,
  militaryBases: 15,
  oilRigs: 15,
  farms: 12,
  enterpriseZones: 4,
  residences: 4,
  researchLabs: 0,
});
/** Oil first — a Raider that hits 0 oil literally can't attack — then farms,
 * then the engine. */
const RAIDER_BUILD_PRIORITY: readonly (keyof Buildings)[] = [
  "oilRigs", "farms", "industrialComplexes", "militaryBases",
  "constructionSites", "enterpriseZones", "residences", "researchLabs",
];

export const ARCHETYPES: Record<ArchetypeTemplate["id"], ArchetypeTemplate> = {
  raider: {
    id: "raider",
    label: "Raider",
    blurb: "Aggressive. Pours resources into offense and comes after you.",
    government: "tyranny",
    decisionTable: RAIDER_DECISION_TABLE,
    attackTypeMix: RAIDER_ATTACK_TYPE_MIX,
    production: RAIDER_PRODUCTION,
    targetMix: RAIDER_TARGET_MIX,
    buyPriority: RAIDER_BUY_PRIORITY,
    buildingMix: RAIDER_BUILDING_MIX,
    buildPriority: RAIDER_BUILD_PRIORITY,
    militarySpendFraction: 0.7,
    buildSpendFraction: 0.5,
    baseline: SHARED_BASELINE,
  },

  economic: {
    id: "economic",
    label: "Economic",
    blurb: "Grows land and treasury fast, neglects its army. High reward, soft target.",
    government: "democracy",
    decisionTable: SHARED_DECISION_TABLE,
    attackTypeMix: SHARED_ATTACK_TYPE_MIX,
    production: SHARED_PRODUCTION,
    targetMix: SHARED_TARGET_MIX,
    buyPriority: SHARED_BUY_PRIORITY,
    buildingMix: SHARED_BUILDING_MIX,
    buildPriority: SHARED_BUILD_PRIORITY,
    militarySpendFraction: DEFAULT_MILITARY_SPEND_FRACTION,
    buildSpendFraction: DEFAULT_BUILD_SPEND_FRACTION,
    baseline: SHARED_BASELINE,
  },

  turtle: {
    id: "turtle",
    label: "Turtle",
    blurb: "Walls up. Minimal growth, heavy turrets — low threat, tedious to crack.",
    government: "theocracy",
    decisionTable: SHARED_DECISION_TABLE,
    attackTypeMix: SHARED_ATTACK_TYPE_MIX,
    production: SHARED_PRODUCTION,
    targetMix: SHARED_TARGET_MIX,
    buyPriority: SHARED_BUY_PRIORITY,
    buildingMix: SHARED_BUILDING_MIX,
    buildPriority: SHARED_BUILD_PRIORITY,
    militarySpendFraction: DEFAULT_MILITARY_SPEND_FRACTION,
    buildSpendFraction: DEFAULT_BUILD_SPEND_FRACTION,
    baseline: SHARED_BASELINE,
  },

  balanced: {
    id: "balanced",
    label: "Balanced",
    blurb: "No strong lean. Moderate at everything.",
    government: "democracy",
    decisionTable: SHARED_DECISION_TABLE,
    attackTypeMix: SHARED_ATTACK_TYPE_MIX,
    production: SHARED_PRODUCTION,
    targetMix: SHARED_TARGET_MIX,
    buyPriority: SHARED_BUY_PRIORITY,
    buildingMix: SHARED_BUILDING_MIX,
    buildPriority: SHARED_BUILD_PRIORITY,
    militarySpendFraction: DEFAULT_MILITARY_SPEND_FRACTION,
    buildSpendFraction: DEFAULT_BUILD_SPEND_FRACTION,
    baseline: SHARED_BASELINE,
  },
};

/** Exported so `makePlayerNation` can start the human from the same position. */
export { SHARED_BASELINE };
