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
  /** "Stay quiet early" hold: this archetype won't roll `attackPlayer` until
   * the season is this fraction through, even after combat unlocks — days
   * spent building economy + army instead. 0 = attack as soon as combat is
   * legal (the default). Raider uses a mid-season hold ("sleeper": build up,
   * then go all-out). Covert ops and defense are unaffected. */
  attackHoldUntilFraction: number;
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

// Only Balanced runs this now — Raider / Economic / Turtle each have their own
// decision table below. The rest of the SHARED_* recipe (production, target
// mix, buildings, priorities, spend fractions) is still genuinely shared;
// personality lives almost entirely in the decision table (see
// docs/archetype-calibration.md).
const BALANCED_DECISION_TABLE: ArchetypeTemplate["decisionTable"] = {
  attackPlayer: 2,
  covertPlayer: 1,
  // Genuinely even build/buy split. (Was 6/3 — a military lean left over from
  // folding the removed `reinforceDefense` weight into `buildMilitary`; in a
  // net-worth race that quietly sank Balanced to last place.)
  buildMilitary: 4,
  buildEconomy: 4,
  // Only ever in play once empty land drops to `archetypeExploreLandFraction`
  // of total (see applyTurn.ts) — otherwise the affordability mask zeroes it.
  explore: 3,
};

/** Economic — economy-heavy weights, barely arms itself. "High reward, soft
 * target." Everything else = shared. Government stays Democracy (Republic's
 * +20% PCI / +20% explore made it a runaway). */
const ECONOMIC_DECISION_TABLE: ArchetypeTemplate["decisionTable"] = {
  attackPlayer: 1,
  covertPlayer: 1,
  buildMilitary: 3,
  buildEconomy: 6,
  explore: 3,
};

/** Turtle — pours turns into military, which the turret-heavy `targetMix`
 * turns almost entirely into wall. Attacks rarely (weight 1) — just enough to
 * shove back and suppress a nation that keeps pressuring it, not a real
 * offensive lean. High floor (rarely dies), low ceiling. */
const TURTLE_DECISION_TABLE: ArchetypeTemplate["decisionTable"] = {
  attackPlayer: 1,
  covertPlayer: 1,
  buildMilitary: 5,
  buildEconomy: 4,
  explore: 2,
};
/** Overrides `SHARED_TARGET_MIX` — the wall is the whole identity. */
const TURTLE_TARGET_MIX: UnitMix = { troops: 20, jets: 10, turrets: 55, tanks: 15 };

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

/** Most archetypes attack the moment combat unlocks. */
const DEFAULT_ATTACK_HOLD_UNTIL_FRACTION = 0;

/** The one starting position — used by every archetype at `baselineMult` 1.0
 * and by `makePlayerNation`. */
const SHARED_BASELINE: ArchetypeTemplate["baseline"] = {
  land: 900,
  cash: 8000,
  military: { ...zeroMil(), troops: 180, turrets: 180, jets: 80, tanks: 20 },
  buildings: { ...zeroBuild(), enterpriseZones: 30, residences: 22, industrialComplexes: 22, farms: 16, oilRigs: 10, researchLabs: 8, militaryBases: 4, constructionSites: 4 },
};

// ---------------------------------------------------------------------------
// Raider — calibrated. Every knob is Balanced's *except* the decision table
// (more aggressive) and the government (Tyranny). Sim sweeps showed that once
// the Raider ran Balanced's economy + defensive foundation and Tyranny's
// income penalty was softened to −10% (see government.ts), a purely
// more-aggressive decision table made it a genuinely strong, distinct
// archetype — it out-conquers and out-grows Balanced. The elaborate
// offense-shaped recipes it used to carry were compensating for handicaps
// that just needed removing. See docs/archetype-calibration.md.
// ---------------------------------------------------------------------------

const RAIDER_DECISION_TABLE: ArchetypeTemplate["decisionTable"] = {
  attackPlayer: 4,
  covertPlayer: 1,
  buildMilitary: 5,
  buildEconomy: 4,
  explore: 3,
};

export const ARCHETYPES: Record<ArchetypeTemplate["id"], ArchetypeTemplate> = {
  raider: {
    id: "raider",
    label: "Raider",
    blurb: "Aggressive. Attacks far more than anyone else and comes after you.",
    government: "tyranny",
    decisionTable: RAIDER_DECISION_TABLE,
    attackTypeMix: SHARED_ATTACK_TYPE_MIX,
    production: SHARED_PRODUCTION,
    targetMix: SHARED_TARGET_MIX,
    buyPriority: SHARED_BUY_PRIORITY,
    buildingMix: SHARED_BUILDING_MIX,
    buildPriority: SHARED_BUILD_PRIORITY,
    militarySpendFraction: DEFAULT_MILITARY_SPEND_FRACTION,
    buildSpendFraction: DEFAULT_BUILD_SPEND_FRACTION,
    attackHoldUntilFraction: DEFAULT_ATTACK_HOLD_UNTIL_FRACTION,
    baseline: SHARED_BASELINE,
  },

  economic: {
    id: "economic",
    label: "Economic",
    blurb: "Grows land and treasury fast, neglects its army. High reward, soft target.",
    government: "democracy",
    decisionTable: ECONOMIC_DECISION_TABLE,
    attackTypeMix: SHARED_ATTACK_TYPE_MIX,
    production: SHARED_PRODUCTION,
    targetMix: SHARED_TARGET_MIX,
    buyPriority: SHARED_BUY_PRIORITY,
    buildingMix: SHARED_BUILDING_MIX,
    buildPriority: SHARED_BUILD_PRIORITY,
    militarySpendFraction: DEFAULT_MILITARY_SPEND_FRACTION,
    buildSpendFraction: DEFAULT_BUILD_SPEND_FRACTION,
    attackHoldUntilFraction: DEFAULT_ATTACK_HOLD_UNTIL_FRACTION,
    baseline: SHARED_BASELINE,
  },

  turtle: {
    id: "turtle",
    label: "Turtle",
    blurb: "Walls up. Minimal growth, heavy turrets — low threat, tedious to crack.",
    government: "theocracy",
    decisionTable: TURTLE_DECISION_TABLE,
    attackTypeMix: SHARED_ATTACK_TYPE_MIX,
    production: SHARED_PRODUCTION,
    targetMix: TURTLE_TARGET_MIX,
    buyPriority: SHARED_BUY_PRIORITY,
    buildingMix: SHARED_BUILDING_MIX,
    buildPriority: SHARED_BUILD_PRIORITY,
    militarySpendFraction: DEFAULT_MILITARY_SPEND_FRACTION,
    buildSpendFraction: DEFAULT_BUILD_SPEND_FRACTION,
    attackHoldUntilFraction: DEFAULT_ATTACK_HOLD_UNTIL_FRACTION,
    baseline: SHARED_BASELINE,
  },

  balanced: {
    id: "balanced",
    label: "Balanced",
    blurb: "No strong lean. Moderate at everything.",
    government: "democracy",
    decisionTable: BALANCED_DECISION_TABLE,
    attackTypeMix: SHARED_ATTACK_TYPE_MIX,
    production: SHARED_PRODUCTION,
    targetMix: SHARED_TARGET_MIX,
    buyPriority: SHARED_BUY_PRIORITY,
    buildingMix: SHARED_BUILDING_MIX,
    buildPriority: SHARED_BUILD_PRIORITY,
    militarySpendFraction: DEFAULT_MILITARY_SPEND_FRACTION,
    buildSpendFraction: DEFAULT_BUILD_SPEND_FRACTION,
    attackHoldUntilFraction: DEFAULT_ATTACK_HOLD_UNTIL_FRACTION,
    baseline: SHARED_BASELINE,
  },
};

/** Exported so `makePlayerNation` can start the human from the same position. */
export { SHARED_BASELINE };
