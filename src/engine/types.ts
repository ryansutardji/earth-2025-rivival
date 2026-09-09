/**
 * Core simulation types. Pure data — no React, no DOM.
 *
 * Terminology follows Earth Empires: bushels, Enterprise Zones, Military Bases,
 * Construction Sites, per-capita income, the eight governments, the eleven tech
 * areas, and the Standard/Planned/Guerilla/Bombing/Artillery attack set.
 */

/** A pseudo-random source returning a float in [0, 1). */
export type Rng = () => number;

export type ArchetypeId = "raider" | "economic" | "turtle" | "balanced";

/** Earth Empires government types (all eight). */
export type GovernmentId =
  | "monarchy"
  | "democracy"
  | "republic"
  | "theocracy"
  | "communism"
  | "dictatorship"
  | "tyranny"
  | "fascism";

/** Earth Empires research areas (eleven). */
export type TechCategory =
  | "military"
  | "medical"
  | "business"
  | "residential"
  | "agricultural"
  | "warfare"
  | "militaryStrategy"
  | "weapons"
  | "industrial"
  | "spy"
  | "sdi";

export const TECH_CATEGORIES: readonly TechCategory[] = [
  "military",
  "medical",
  "business",
  "residential",
  "agricultural",
  "warfare",
  "militaryStrategy",
  "weapons",
  "industrial",
  "spy",
  "sdi",
];

/**
 * Built acres by Earth Empires structure type.
 * - `enterpriseZones`     — raises per-capita income
 * - `residences`          — raises population capacity
 * - `industrialComplexes` — produce military units (per the production mix)
 * - `militaryBases`       — cut per-turn military upkeep and private-market prices
 * - `researchLabs`        — research points per turn (labs ÷ land ratio)
 * - `farms`               — bushels per turn
 * - `oilRigs`             — oil per turn
 * - `constructionSites`   — raise buildings-per-turn; always 1 turn each to build
 */
export interface Buildings {
  enterpriseZones: number;
  residences: number;
  industrialComplexes: number;
  militaryBases: number;
  researchLabs: number;
  farms: number;
  oilRigs: number;
  constructionSites: number;
}

export const BUILDING_TYPES: readonly (keyof Buildings)[] = [
  "enterpriseZones",
  "residences",
  "industrialComplexes",
  "militaryBases",
  "researchLabs",
  "farms",
  "oilRigs",
  "constructionSites",
];

/**
 * Military units.
 * - `troops`  — Standard/Planned/Guerilla; offence + defence
 * - `jets`    — Standard/Planned offence, Bombing Run; no defence
 * - `turrets` — Standard/Planned/Bombing defence; no offence
 * - `tanks`   — Standard/Planned offence, Artillery Barrage; offence + defence
 * - `spies`   — covert ops only; can't be bought, only produced by Industrial Complexes
 */
export interface Military {
  troops: number;
  jets: number;
  turrets: number;
  tanks: number;
  spies: number;
}

export const UNIT_TYPES: readonly (keyof Military)[] = ["troops", "jets", "turrets", "tanks", "spies"];

/** The 4 unit types that can actually be purchased — spies can only ever
 * come from factory production (`config.unitCost.spies` is unused; real EE
 * doesn't sell spies either). */
export type PurchasableUnit = Exclude<keyof Military, "spies">;
export const PURCHASABLE_UNITS: readonly PurchasableUnit[] = ["troops", "jets", "turrets", "tanks"];

/** A Planned Strike's committed forces, resting for `turnsLeft` more turns
 * before returning to the standing army. Only troops/jets/tanks deploy —
 * turrets and spies never leave, so a brigade never holds either. */
export interface Brigade {
  troops: number;
  jets: number;
  tanks: number;
  turnsLeft: number;
}

/** A slice of a nation's military pulled off the wall each time it's attacked
 * — can't help attack or defend for `turnsLeft` more turns. Stacks per attack;
 * see `config.defenseSuppression*` and `brigades.ts`. */
export interface SuppressedForce {
  troops: number;
  jets: number;
  turrets: number;
  tanks: number;
  spies: number;
  turnsLeft: number;
}

/** Units the Industrial Complexes turn out, as a percentage mix (sums to ~100). */
export type ProductionMix = Record<keyof Military, number>;

export type MissileType = "chemical" | "cruise" | "nuclear";
export const MISSILE_TYPES: readonly MissileType[] = ["chemical", "cruise", "nuclear"];
export type MissileStock = Record<MissileType, number>;

export type TechLevels = Record<TechCategory, number>;

export interface Nation {
  id: string;
  name: string;
  isPlayer: boolean;

  /** Total acres owned (built + empty). */
  land: number;
  buildings: Buildings;

  /** Cash on hand. */
  cash: number;

  /** Citizens. Per-capita income × tax is the country's revenue. */
  population: number;
  /** Bushel stockpile. Population + military eat bushels each turn. */
  bushels: number;
  /** Oil stockpile. 1 barrel per 25 units sent into battle. */
  oil: number;

  military: Military;
  missiles: MissileStock;
  /** Industrial Complex output split (percentages summing to ~100). */
  production: ProductionMix;

  /** Accumulated research points per area. */
  tech: TechLevels;
  /** Where this turn's lab output flows. */
  researchFocus: TechCategory;

  government: GovernmentId;
  /** AI only: the government this nation will adopt on turn 1 (set at season
   * generation — the archetype's fixed choice, or a random one). Omitted for
   * the player; falls back to the archetype default if absent. */
  targetGovernment?: GovernmentId;
  /** 0..0.70 — fraction of per-capita income taken as tax. */
  taxRate: number;

  /** Forces resting after a Planned Strike — unavailable for attack or
   * defense until `turnsLeft` counts down to 0. Still counted in `military`
   * (still fed, still paid, still part of net worth); see `brigades.ts`. */
  brigades: Brigade[];

  /** Forces pulled off the wall by recent attacks — one entry per attack
   * suffered, each `config.defenseSuppressionPct` of the military at the time,
   * expiring after `config.defenseSuppressionTurns`. Like `brigades`, they
   * stay in `military` but `availableMilitary` subtracts them out. */
  defenseSuppression: SuppressedForce[];

  /** AI nations' own daily turn budget — refilled to `turnPoolCap` once a
   * day, spent action by action exactly like the player's `turnsRemaining`.
   * Unused for the player (their turns live on `WorldState.turnsRemaining`). */
  aiTurnsRemaining: number;

  /** What this nation has personally learned about every other nation from
   * its own successful `spy` ops, keyed by target id. Every nation keeps its
   * own — this isn't player-only fog-of-war. */
  intel: Record<string, EnemyIntel>;
  /** Decaying grievances against other nations, keyed by offender id — see
   * `Grudge`. */
  grudges: Record<string, Grudge>;
  /** Diminishing-returns heat from repeated harmful covert ops *against this
   * nation*, regardless of who's doing the spying — matches the wiki:
   * heat is the defender's own accumulated alertness, not tied to one
   * attacker. Decays over time (`config.covert.heatDecayPerDay`). */
  covertHeat: number;
  /** AI-only "this fight isn't winnable right now" memory, keyed by the id
   * of a nation this one has *attacked* and been repelled by. A repelled
   * attack bumps the score, a successful one clears it; above
   * `config.attackFutilityThreshold` that target drops out of this nation's
   * attack target-selection until the score decays. Distinct from `grudges`
   * (who attacked *me*) — this is "who beat me when *I* attacked *them*". */
  attackFutility: Record<string, number>;

  /** Present only for AI nations. */
  archetype?: ArchetypeId;
  /** Player actions this nation has lived through (per-action clock). */
  ticksAlive: number;

  defeated: boolean;
}

/** Difficulty is data: one of these is active for a whole season. */
export interface DifficultyTier {
  id: string;
  label: string;
  /** Share of the season that must pass before *anyone* can attack. The AI
   * always uses this; the player uses `min(this, config.noAttackDaysFraction)`
   * — so easier-than-Veteran tiers hold the AI back longer while the player
   * keeps the standard window, and harder tiers pull both forward. */
  attackUnlockFraction: number;
  /** Peak of the season-heat ramp (hostile decision weights climb ×1 on day 1
   * to ×this on the final day). Higher tiers ramp harder. */
  seasonHeatMaxMult: number;
  /** Added to `config.turnPoolCap` for AI nations' daily turn budget (the
   * player's is always the base). Negative on easy tiers, positive on hard. */
  aiTurnPoolDelta: number;
}

export interface SeasonConfig {
  tierId: string;
  rosterSize: number;
  eligibleArchetypes: ArchetypeId[];
  /** Days before the season is scored by net worth. */
  seasonLengthDays: number;
  /** The player's starting government. */
  playerGovernment: GovernmentId;
  /** How AI nations pick their government: `"archetype"` (each archetype's
   * calibrated fixed choice — the default) or `"random"` (a seeded random
   * government per nation, ignoring the archetype). */
  governmentMode?: "archetype" | "random";
  seed: number;
}

/** Everything the player can buy on the private market: the four purchasable
 * unit types (spies are Industrial-Complex-only), plus bushels and oil. */
export type BuyableGood = "troops" | "jets" | "turrets" | "tanks" | "bushels" | "oil";

export const BUYABLE_GOODS: readonly BuyableGood[] = [
  "troops",
  "jets",
  "turrets",
  "tanks",
  "bushels",
  "oil",
];

export type CombatOutcome = "attacker_won" | "attacker_repelled";

/**
 * Earth Empires attack set.
 * - `standard`  — Standard Strike: capture land + money + bushels + buildings + tech
 * - `planned`   — Planned Strike: as standard, +50% strength, richer returns
 * - `guerilla`  — Guerilla Strike: troops only vs troops; kills population + bushels
 * - `bombing`   — Bombing Run: jets only vs turrets; kills population + razes buildings
 * - `artillery` — Artillery Barrage: tanks only vs tanks; razes buildings, no land
 */
export type AttackType = "standard" | "planned" | "guerilla" | "bombing" | "artillery";

export const ATTACK_TYPES: readonly AttackType[] = [
  "standard",
  "planned",
  "guerilla",
  "bombing",
  "artillery",
];

/** How many of each unit type to commit to an attack. Omit a field (or the
 * whole object) to send everything available of that type — only fields
 * relevant to the chosen `AttackType` matter (e.g. `jets` is ignored for a
 * Guerilla Strike). */
export type AttackOrders = Partial<Record<"troops" | "jets" | "tanks", number>>;

export interface UnitLosses {
  troops: number;
  jets: number;
  turrets: number;
  tanks: number;
}

/**
 * Everything that happened in one battle. The engine has already applied these
 * deltas to the two nations by the time a caller sees this.
 */
export interface CombatResult {
  outcome: CombatOutcome;
  attackType: AttackType;
  attackerId: string;
  defenderId: string;
  attackerName: string;
  defenderName: string;
  attackerOffense: number;
  defenderDefense: number;
  /** Units actually committed to this attack (only the relevant fields for
   * this attack type are nonzero) — may be less than everything the attacker
   * had, if they chose to hold some back. */
  sent: { troops: number; jets: number; tanks: number };
  /** Set on any Planned Strike (won or repelled): the survivors of `sent` are
   * resting this many turns, unavailable for another attack or for defense.
   * Undefined for every other attack type. */
  restingTurns?: number;
  landCaptured: number;
  cashLooted: number;
  bushelsLooted: number;
  /** Barrels of oil seized from the defender on a won land-grab. */
  oilLooted: number;
  techLooted: number;
  populationKilled: number;
  /** Acres of buildings that changed hands: seized by the attacker on a won
   * land-grab, or destroyed on a bombing / artillery hit. */
  buildingsRazed: number;
  oilSpent: number;
  attackerLosses: UnitLosses;
  defenderLosses: UnitLosses;
  /** Set when this battle pushed the defender past the defeat thresholds. */
  defenderDefeated: boolean;
  log: string[];
}

/** Missile strike result. */
export interface MissileResult {
  missile: MissileType;
  attackerId: string;
  defenderId: string;
  attackerName: string;
  defenderName: string;
  /** SDI stopped it. */
  intercepted: boolean;
  landDestroyed: number;
  buildingsRazed: number;
  populationKilled: number;
  unitsKilled: number;
  defenderDefeated: boolean;
  log: string[];
}

/**
 * Earth Empires spy operations.
 * - `spy`                  — report: full advisor-style snapshot (lifts fog-of-war)
 * - `espionage`            — steal a slice of the target's tech points
 * - `bombBuildings`        — destroy a slice of the target's buildings
 * - `raidFoodStores`       — burn + capture a slice of the target's bushels
 * - `sabotageIntelligence` — kill a slice of the target's spies
 * - `causeDissensions`     — a slice of the target's troops desert
 */
export type CovertOp =
  | "spy"
  | "espionage"
  | "bombBuildings"
  | "raidFoodStores"
  | "sabotageIntelligence"
  | "causeDissensions";

export const COVERT_OPS: readonly CovertOp[] = [
  "spy",
  "espionage",
  "bombBuildings",
  "raidFoodStores",
  "sabotageIntelligence",
  "causeDissensions",
];

/** A snapshot of a nation captured by a successful Spy op — may be stale.
 * Every nation keeps its own `intel` record of who it's scouted — this isn't
 * player-only, any archetype that successfully spies on anyone (the player
 * or another archetype) gets one of these on them too. Derived from `Nation`
 * so the field types can't drift, plus `day` (when it was taken) and
 * `netWorth` (a computed value, not a `Nation` field). */
export type EnemyIntel = Pick<
  Nation,
  "land" | "population" | "bushels" | "oil" | "cash" | "buildings" | "military" | "missiles" | "tech" | "government"
> & {
  day: number;
  netWorth: number;
};

/** A decaying grievance against another nation — they attacked us, or got
 * caught (detected) failing a spy op against us. Feeds target-priority
 * scoring: a nation with a live grudge against someone is likelier to go
 * after them specifically, matching how real EE tells you who was detected
 * attempting an op against you. */
export interface Grudge {
  againstId: string;
  /** Decaying score — higher means a stronger, more recent grievance. */
  score: number;
  lastEventDay: number;
  /** Plain-language cause, for logs/UI — e.g. "attacked you (Standard
   * Strike)" or "was caught attempting Raid Food Stores". */
  lastEventLabel: string;
}

export interface CovertResult {
  op: CovertOp;
  attackerId: string;
  defenderId: string;
  attackerName: string;
  defenderName: string;
  success: boolean;
  /** The defender identified who was behind it. */
  detected: boolean;
  successChance: number;
  spiesLost: number;
  techStolen: number;
  bushelsRaided: number;
  buildingsSabotaged: number;
  troopsDeserted: number;
  spiesSabotaged: number;
  /** Present on a successful `spy` op. */
  intel?: EnemyIntel;
  log: string[];
}

/**
 * Result of applying a single player action. Pure functions produce this; the
 * store copies `nation` / `turnsRemaining` back into the world on `ok`.
 */
export interface ActionResult {
  ok: boolean;
  /** Set when `ok` is false — a player-facing reason the action was rejected. */
  error?: string;
  nation: Nation;
  turnsRemaining: number;
  log: string[];
}

/**
 * How a season ends. `playing` while in progress; a `won_*` / `lost_*` value
 * once it is over (the world is then frozen — further actions are rejected).
 */
export type SeasonStatus = "playing" | "won_elimination" | "won_networth" | "lost_networth" | "lost_eliminated";

/** One row of the end-of-season net-worth ranking. */
export interface Standing {
  id: string;
  name: string;
  isPlayer: boolean;
  /** Net worth at season end; 0 for a defeated nation. */
  netWorth: number;
  defeated: boolean;
}

/** The full serializable game state. */
export interface WorldState {
  schemaVersion: number;
  config: SeasonConfig;
  /** Serialized mulberry32 state — restore the RNG stream from this. */
  rngState: number;
  day: number;
  /** Snapshot of the season length, so editing the default mid-season is safe. */
  seasonLengthDays: number;
  /** This season's tax comfort threshold — seeded once at season generation
   * from `config.taxComfortThresholdRange`, so where the tax "sweet spot"
   * lands varies game to game instead of being one number to memorize. */
  taxComfortThreshold: number;
  turnsRemaining: number;
  player: Nation;
  enemies: Nation[];
  status: SeasonStatus;
  log: string[];
}
