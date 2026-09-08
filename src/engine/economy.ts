/**
 * The per-tick economy simulation (Earth Empires model). One tick = one player
 * action; the End-Day tick and the "Cash" action pass flags.
 *
 * Flow: per-capita income (population × PCI × tax) − military upkeep → factory
 * output (per the production mix) → research → bushels (with starvation) → oil →
 * missiles → population growth.
 *
 * Pure: `applyEconomyTick` returns a new nation, never mutates.
 */

import { config } from "./config";
import { seasonPacingMult } from "./pacing";
import { gov } from "./government";
import {
  agriculturalTechMult,
  businessTechMult,
  industrialTechMult,
  militaryCostTechMult,
  residentialTechMult,
  warfareTechRate,
} from "./tech";
import type { Buildings, Military, MissileStock, Nation } from "./types";
import { BUILDING_TYPES, UNIT_TYPES } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function builtAcres(n: Nation): number {
  return BUILDING_TYPES.reduce((sum, t) => sum + n.buildings[t], 0);
}

export function emptyAcres(n: Nation): number {
  return Math.max(0, n.land - builtAcres(n));
}

/** Remove `acres` of built land, spread across building types by current
 * share. Shared by combat (land grabs, bombing/artillery), covert ops
 * (Bomb Buildings), missiles, and the government-change instability penalty. */
export function razeBuildings(b: Buildings, acres: number): { buildings: Buildings; razed: number } {
  const total = BUILDING_TYPES.reduce((s, k) => s + b[k], 0);
  if (total <= 0 || acres <= 0) return { buildings: b, razed: 0 };
  const take = Math.min(acres, total);
  const out = { ...b };
  let razed = 0;
  for (const k of BUILDING_TYPES) {
    const cut = Math.min(out[k], Math.round((b[k] / total) * take));
    out[k] -= cut;
    razed += cut;
  }
  return { buildings: out, razed };
}

/** All units including spies — bushel upkeep + display. */
export function totalMilitary(m: Military): number {
  return m.troops + m.jets + m.turrets + m.tanks + m.spies;
}

/** Battlefield units (spies excluded) — combat readiness & defeat checks. */
export function battleUnits(m: Military): number {
  return m.troops + m.jets + m.turrets + m.tanks;
}

/** Spies per acre of land — the covert-op strength metric. */
export function spal(n: Nation): number {
  return n.military.spies / Math.max(1, n.land);
}

export function popCapacity(n: Nation): number {
  const base = config.popBaseCapacity + n.buildings.residences * config.popPerResidence;
  const unused = emptyAcres(n) * config.unusedLandPopFactor * config.popPerResidence;
  return (base + unused) * residentialTechMult(n) * gov(n.government).maxPopMult;
}

/**
 * Per-capita income a citizen earns this turn (pre-tax).
 * @param taxComfortThreshold this season's seeded sweet-spot threshold (see
 *   `WorldState.taxComfortThreshold`); defaults to a fixed fallback for
 *   callers without a world (tests, isolated previews).
 */
export function perCapitaIncome(n: Nation, taxComfortThreshold: number = config.taxComfortThresholdDefault): number {
  const g = gov(n.government);
  const ezBoost = 1 + (n.buildings.enterpriseZones / Math.max(1, n.land)) * config.ezPciFactor;
  const unusedBoost = 1 + (emptyAcres(n) / Math.max(1, n.land)) * config.unusedLandPciFactor;
  const taxDrag = 1 - Math.max(0, (n.taxRate - taxComfortThreshold) * config.taxPciSlope);
  return config.basePci * ezBoost * unusedBoost * clamp(taxDrag, 0.15, 1) * businessTechMult(n) * g.pciMult;
}

/** Fractional discount Military Bases give to per-unit upkeep *and*
 * private-market unit prices (`1 - this` multiplies both). Capped. */
export function militaryBaseCostCut(n: Nation): number {
  return Math.min(
    config.militaryBaseUpkeepCap,
    (n.buildings.militaryBases / Math.max(1, n.land)) * config.militaryBaseUpkeepFactor,
  );
}

/** Per-turn military upkeep in cash (Military tech + Military Bases + government). */
export function militaryUpkeep(n: Nation): number {
  const u = config.upkeepPerUnit;
  const raw =
    n.military.troops * u.troops +
    n.military.jets * u.jets +
    n.military.turrets * u.turrets +
    n.military.tanks * u.tanks +
    n.military.spies * u.spies;
  return raw * militaryCostTechMult(n) * gov(n.government).militaryCostMult * (1 - militaryBaseCostCut(n));
}

export interface EconomyRates {
  /** Tax revenue: population × PCI × taxRate. */
  grossCash: number;
  upkeep: number;
  /** grossCash − upkeep. */
  cash: number;
  bushelsProduced: number;
  bushelsConsumed: number;
  bushelsNet: number;
  oilNet: number;
  tech: number;
  unitsProduced: number;
}

/**
 * @param seasonLengthDays  Scales every rate by `seasonPacingMult` so a longer
 *   season produces resources more slowly and a shorter one more quickly —
 *   the season keeps the same overall shape. Defaults to the tuned baseline
 *   (no scaling) when omitted.
 * @param taxComfortThreshold this season's seeded tax sweet spot — see `perCapitaIncome`.
 */
export function projectRates(
  n: Nation,
  revenueMult = 1,
  seasonLengthDays: number = config.pacingBaselineSeasonDays,
  taxComfortThreshold: number = config.taxComfortThresholdDefault,
): EconomyRates {
  const g = gov(n.government);
  const pace = seasonPacingMult(seasonLengthDays);

  const grossCash = n.population * perCapitaIncome(n, taxComfortThreshold) * n.taxRate * revenueMult * pace;
  const upkeep = militaryUpkeep(n) * pace;

  const unitsProduced =
    n.buildings.industrialComplexes * config.unitsPerComplexAcre * industrialTechMult(n) * g.industrialMult * pace;

  const tech = n.buildings.researchLabs * config.techPerLabAcre * g.techRateMult * pace;

  const bushelsProduced =
    (n.buildings.farms * config.bushelsPerFarmAcre * agriculturalTechMult(n) * g.foodMult +
      emptyAcres(n) * config.bushelsPerUnusedAcre) *
    pace;
  const bushelsConsumed =
    (n.population * config.bushelsPerCitizen + totalMilitary(n.military) * config.bushelsPerUnit) * pace;

  const oilProduced = n.buildings.oilRigs * config.oilPerRigAcre * g.oilMult * pace;

  return {
    grossCash,
    upkeep,
    cash: grossCash - upkeep,
    bushelsProduced,
    bushelsConsumed,
    bushelsNet: bushelsProduced - bushelsConsumed,
    oilNet: oilProduced,
    tech,
    unitsProduced,
  };
}

function distribute(points: number, mix: Nation["production"]): Military {
  const total = UNIT_TYPES.reduce((s, u) => s + Math.max(0, mix[u]), 0) || 1;
  const out = zeroMil();
  for (const u of UNIT_TYPES) out[u] = Math.round((points * Math.max(0, mix[u])) / total);
  return out;
}
const zeroMil = (): Military => ({ troops: 0, jets: 0, turrets: 0, tanks: 0, spies: 0 });

const addMil = (a: Military, b: Military): Military => ({
  troops: a.troops + b.troops,
  jets: a.jets + b.jets,
  turrets: a.turrets + b.turrets,
  tanks: a.tanks + b.tanks,
  spies: a.spies + b.spies,
});

const scaleMil = (m: Military, f: number): Military => ({
  troops: Math.floor(m.troops * f),
  jets: Math.floor(m.jets * f),
  turrets: Math.floor(m.turrets * f),
  tanks: Math.floor(m.tanks * f),
  spies: m.spies,
});

function produceMissiles(n: Nation, rng: () => number, pace: number): MissileStock {
  const rate = warfareTechRate(n) * config.missile.productionScale * pace;
  const built = Math.floor(rate) + (rng() < rate % 1 ? 1 : 0);
  if (built <= 0) return n.missiles;
  const mix = config.missile.mix;
  return {
    chemical: n.missiles.chemical + Math.round(built * mix.chemical),
    cruise: n.missiles.cruise + Math.round(built * mix.cruise),
    nuclear: n.missiles.nuclear + Math.round(built * mix.nuclear),
  };
}

export interface EconomyTick {
  nation: Nation;
  log: string[];
}

/** One turn's worth of change, for the per-turn event-log breakdown. */
export interface TurnEconomy {
  grossCash: number;
  upkeep: number;
  cashNet: number;
  bushelsProduced: number;
  bushelsConsumed: number;
  bushelsNet: number;
  popGain: number;
}

const signed = (v: number, prefix = ""): string =>
  v >= 0 ? `+${prefix}${v.toLocaleString()}` : `−${prefix}${(-v).toLocaleString()}`;

/** Compact one-line turn summary for the event log (small window). */
export function formatTurnEconomy(te: TurnEconomy): string {
  return `↳ ${signed(te.cashNet, "$")} · ${signed(te.bushelsNet)} bu · ${signed(te.popGain)} pop`;
}

/**
 * @param revenueMult      1.0 normally, `config.cashTurnBonus` on a "Cash" turn
 * @param rng              consumed only for the missile-production coin flip
 * @param seasonLengthDays scales every rate — see `projectRates`
 * @param turns            how many turns' worth of economy this tick represents.
 *                         The tick loops turn-by-turn (population growth feeds
 *                         next turn's income, etc.). `0` is a genuine no-op.
 * @param logPerTurn       push one compact `+$… · +… bu · +… pop` line per turn
 *                         (the player's own actions; the AI stays silent).
 */
export function applyEconomyTick(
  n: Nation,
  revenueMult = 1,
  rng: () => number = Math.random,
  seasonLengthDays: number = config.pacingBaselineSeasonDays,
  taxComfortThreshold: number = config.taxComfortThresholdDefault,
  turns = 1,
  logPerTurn = false,
): EconomyTick & { perTurn: TurnEconomy[] } {
  const log: string[] = [];
  const perTurn: TurnEconomy[] = [];
  const t = Math.max(0, turns);
  const pace = seasonPacingMult(seasonLengthDays);

  let military = n.military;
  let cash = n.cash;
  let population = n.population;
  let bushels = n.bushels;
  let oil = n.oil;
  let tech = { ...n.tech };
  let starvedThisTick = false;
  let brokeThisTick = false;

  for (let i = 0; i < t; i++) {
    const working: Nation = { ...n, military, cash, population, bushels, oil, tech };
    const r = projectRates(working, revenueMult, seasonLengthDays, taxComfortThreshold);

    military = addMil(military, distribute(Math.max(0, r.unitsProduced), n.production));
    cash += r.cash;
    bushels += r.bushelsNet;
    oil = Math.max(0, oil + r.oilNet);
    tech = { ...tech, [n.researchFocus]: tech[n.researchFocus] + r.tech };

    if (cash < 0) {
      cash = 0;
      population *= 1 - config.cashCrisisUnitLossPct;
      military = scaleMil(military, 1 - config.cashCrisisUnitLossPct);
      brokeThisTick = true;
    }
    if (bushels < 0) {
      bushels = 0;
      population *= 1 - config.starvationPopLossPct;
      military = scaleMil(military, 1 - config.starvationUnitLossPct);
      starvedThisTick = true;
    }

    // One turn of population convergence toward capacity.
    const capacity = popCapacity(working);
    const taxUnhappy = Math.max(0, (n.taxRate - taxComfortThreshold) * config.taxUnhappySlope);
    const happiness = clamp(1 - taxUnhappy, 0.1, 1.2);
    const fedFactor = bushels > 0 ? 1 : 0.3;
    const stepRate = config.popGrowthRate * happiness * fedFactor * pace;
    const before = population;
    population = Math.max(50, population + (capacity - population) * stepRate);

    if (logPerTurn) {
      const te: TurnEconomy = {
        grossCash: Math.round(r.grossCash),
        upkeep: Math.round(r.upkeep),
        cashNet: Math.round(r.cash),
        bushelsProduced: Math.round(r.bushelsProduced),
        bushelsConsumed: Math.round(r.bushelsConsumed),
        bushelsNet: Math.round(r.bushelsNet),
        popGain: Math.round(population - before),
      };
      perTurn.push(te);
      log.push(formatTurnEconomy(te));
    }
  }

  if (brokeThisTick) log.push(`${n.name}: TREASURY EMPTY — troops are deserting for lack of pay.`);
  if (starvedThisTick) log.push(`${n.name}: STARVATION — bushels ran out; citizens and troops are dying.`);

  const missiles = produceMissiles(n, rng, pace * t);

  // Recent-attack defense suppression counts down by turns spent, same cadence
  // as everything else here; finished entries drop off and those units rejoin
  // the wall (they were never removed from `military`).
  const defenseSuppression = (n.defenseSuppression ?? [])
    .map((f) => ({ ...f, turnsLeft: f.turnsLeft - t }))
    .filter((f) => f.turnsLeft > 0);

  const nation: Nation = {
    ...n,
    cash,
    bushels: Math.round(bushels),
    oil: Math.round(oil),
    population: Math.round(population),
    military,
    missiles,
    tech,
    defenseSuppression,
  };
  return { nation, log, perTurn };
}
