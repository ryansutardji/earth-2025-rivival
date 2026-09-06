/**
 * Combat resolution — the Earth Empires attack set. One formula, five attack
 * types; it does not care whether either side is the player or an AI archetype.
 *
 *   standard  — Standard Strike : capture land + cash + bushels + buildings + tech
 *   planned   — Planned Strike  : as standard, ×1.5 strength, richer returns —
 *               and survivors rest in a brigade afterward (see `brigades.ts`)
 *   guerilla  — Guerilla Strike : troops vs troops; kill population + bushels
 *   bombing   — Bombing Run     : jets vs turrets; kill population + raze buildings
 *   artillery — Artillery Barrage: tanks vs tanks; raze buildings, no land
 *
 * Every attack lets the attacker choose how much of their available (i.e. not
 * currently resting in a brigade) troops/jets/tanks to actually send — an
 * omitted or over-large request just means "everything available."
 */

import { config } from "./config";
import { gov } from "./government";
import { medicalTechMult, strategyTechMult, weaponsTechMult } from "./tech";
import { battleUnits, builtAcres, totalMilitary } from "./economy";
import { availableMilitary } from "./brigades";
import { BUILDING_TYPES } from "./types";
import type { AttackOrders, AttackType, Brigade, Buildings, CombatResult, Military, Nation, Rng, UnitLosses } from "./types";

type PowerTable = { troops: number; jets: number; turrets: number; tanks: number; spies: number };

const dot = (m: Military, p: PowerTable): number =>
  m.troops * p.troops + m.jets * p.jets + m.turrets * p.turrets + m.tanks * p.tanks;

function powerOf(military: Military, n: Nation, table: PowerTable): number {
  return dot(military, table) * weaponsTechMult(n) * gov(n.government).militaryStrengthMult;
}

/** Preview power — what's actually usable right now (excludes resting brigades). */
export function offensePower(n: Nation, type: AttackType = "standard"): number {
  return powerOf(availableMilitary(n), n, config.power[type].off);
}

export function defensePower(n: Nation, type: AttackType = "standard"): number {
  return powerOf(availableMilitary(n), n, config.power[type].def);
}

function swing(rng: Rng, variance: number): number {
  return 1 + variance * (rng() * 2 - 1);
}

/** Wider swing the more lopsided offense vs. defense is — an even fight stays
 * exactly as contested as `combatVariance` alone, but a big favorite's
 * opponent gets a real (if slim) shot instead of a mathematically guaranteed
 * loss. Ratio is the stronger side's power over the weaker side's. */
export function combatVarianceFor(atkBase: number, defBase: number): number {
  const a = Math.max(0, atkBase);
  const d = Math.max(0, defBase);
  const ratio = a <= 0 || d <= 0 ? Infinity : Math.max(a / d, d / a);
  return Math.min(config.combatVarianceMax, config.combatVariance + config.combatVarianceGrowth * (ratio - 1));
}

/** Which unit types this attack type sends into the fight. */
function relevantTypes(type: AttackType): Array<"troops" | "jets" | "tanks"> {
  if (type === "guerilla") return ["troops"];
  if (type === "bombing") return ["jets"];
  if (type === "artillery") return ["tanks"];
  return ["troops", "jets", "tanks"]; // standard / planned
}

/**
 * How many of each unit type the attacker actually commits. Fields irrelevant
 * to `type` are always 0. Two distinct defaults:
 *   - `orders` omitted entirely → send everything available (every relevant
 *     type) — the "just attack" case, and what every AI archetype does.
 *   - `orders` given, even partially → any field *not* in it is 0, not
 *     "everything." Naming only `troops` sends troops and nothing else; it
 *     doesn't also throw in every available tank. Requested amounts are
 *     clamped to what's actually available.
 * Exported so `turn.ts` can preview/validate a requested attack before
 * calling `resolveCombat`.
 */
export function resolveSent(attacker: Nation, type: AttackType, orders?: AttackOrders): Military {
  const avail = availableMilitary(attacker);
  const types = relevantTypes(type);
  const want = (u: "troops" | "jets" | "tanks"): number => {
    if (!types.includes(u)) return 0;
    if (orders === undefined) return avail[u];
    const requested = orders[u] ?? 0;
    return Math.max(0, Math.min(requested, avail[u]));
  };
  return { troops: want("troops"), jets: want("jets"), turrets: 0, tanks: want("tanks"), spies: 0 };
}

function losses(m: Military, pct: number, type: AttackType): UnitLosses {
  // Only deployed unit types take losses for a targeted attack.
  const hit = (u: keyof Military) => {
    if (type === "guerilla") return u === "troops";
    if (type === "bombing") return u === "jets";
    if (type === "artillery") return u === "tanks";
    return u === "troops" || u === "jets" || u === "tanks" || u === "turrets";
  };
  return {
    troops: hit("troops") ? Math.floor(m.troops * pct) : 0,
    jets: hit("jets") ? Math.floor(m.jets * pct) : 0,
    turrets: hit("turrets") ? Math.floor(m.turrets * pct) : 0,
    tanks: hit("tanks") ? Math.floor(m.tanks * pct) : 0,
  };
}

function subtract(m: Military, l: UnitLosses): Military {
  return {
    troops: Math.max(0, m.troops - l.troops),
    jets: Math.max(0, m.jets - l.jets),
    turrets: Math.max(0, m.turrets - l.turrets),
    tanks: Math.max(0, m.tanks - l.tanks),
    spies: m.spies,
  };
}

/** Remove `acres` of built land, spread across building types by current share. */
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

const ZERO_LOSS: UnitLosses = { troops: 0, jets: 0, turrets: 0, tanks: 0 };
const techPoints = (n: Nation): number => Object.values(n.tech).reduce((s, v) => s + v, 0);

export interface CombatResolution {
  result: CombatResult;
  attacker: Nation;
  defender: Nation;
}

export function resolveCombat(
  attacker: Nation,
  defender: Nation,
  attackType: AttackType,
  rng: Rng,
  orders?: AttackOrders,
): CombatResolution {
  const sent = resolveSent(attacker, attackType, orders);
  const sentTotal = sent.troops + sent.jets + sent.tanks;
  const oilSpent = Math.min(attacker.oil, Math.ceil(sentTotal / config.unitsPerOilBarrel));

  let atkBase = powerOf(sent, attacker, config.power[attackType].off);
  if (attackType === "planned") atkBase *= config.plannedStrikeBonus;
  const homeBonus = config.homeDefenseBonus + defender.land * config.homeDefenseLandFactor;
  // Defense uses the defender's available military — anything resting in one
  // of their own brigades can't help defend, same as it can't attack.
  const defBase = powerOf(availableMilitary(defender), defender, config.power[attackType].def) + homeBonus;

  const variance = combatVarianceFor(atkBase, defBase);
  const atkEff = atkBase * swing(rng, variance);
  const defEff = defBase * swing(rng, variance);
  const won = atkEff > defEff;

  const isLandGrab = attackType === "standard" || attackType === "planned";
  const g = gov(attacker.government);
  const strat = strategyTechMult(attacker);

  let attackerLosses: UnitLosses = ZERO_LOSS;
  let defenderLosses: UnitLosses = ZERO_LOSS;
  let landCaptured = 0;
  let cashLooted = 0;
  let bushelsLooted = 0;
  let techLooted = 0;
  let populationKilled = 0;
  let buildingsRazed = 0;
  let nextDefBuildings = defender.buildings;

  // The defender's Medical tech softens their losses when they lose the battle.
  const defMed = won ? medicalTechMult(defender) : 1;
  const defAvail = availableMilitary(defender);

  if (won) {
    attackerLosses = losses(sent, config.winnerUnitLossPct, attackType);
    defenderLosses = losses(defAvail, config.loserUnitLossPct * defMed, attackType);

    if (isLandGrab) {
      const sizeRatio = clamp(defender.land / Math.max(1, attacker.land), 0.4, 3);
      const pct = config.landCaptureMinPct + (config.landCaptureMaxPct - config.landCaptureMinPct) * clamp((sizeRatio - 0.4) / 2.6, 0, 1);
      const capturable = Math.max(0, defender.land);
      const raw = Math.max(Math.floor(defender.land * pct), config.minLandCapture);
      landCaptured = Math.min(capturable, Math.round(raw * g.attackGainsMult * strat));
      cashLooted = Math.floor(defender.cash * config.cashLootPct * g.attackGainsMult * strat);
      bushelsLooted = Math.floor(defender.bushels * config.bushelLootPct * strat);
      techLooted = Math.floor(techPoints(defender) * config.techLootPct * strat);

      const capturedBuildings = Math.round(landCaptured * config.buildingCapturePct * g.buildingCaptureMult);
      const r = razeBuildings(defender.buildings, capturedBuildings);
      nextDefBuildings = r.buildings;
      buildingsRazed = r.razed; // "razed" here = removed from defender (attacker keeps as empty land)
    } else if (attackType === "guerilla") {
      populationKilled = Math.floor(defender.population * config.populationKillPct);
      bushelsLooted = Math.floor(defender.bushels * config.bushelLootPct);
    } else {
      // bombing / artillery
      if (attackType === "bombing") populationKilled = Math.floor(defender.population * config.populationKillPct * 0.6);
      const wanted = Math.max(Math.floor(builtAcres(defender) * config.buildingRazePct), config.minRaze);
      const r = razeBuildings(defender.buildings, wanted);
      nextDefBuildings = r.buildings;
      buildingsRazed = r.razed;
    }
  } else {
    attackerLosses = losses(sent, config.repelledLossPct, attackType);
    defenderLosses = losses(defAvail, config.winnerUnitLossPct, attackType);
  }

  const attackerMilitary = subtract(attacker.military, attackerLosses);
  let brigades = attacker.brigades;
  let restingTurns: number | undefined;

  if (attackType === "planned") {
    // Whatever survived the sent force — win or lose — rests in a new
    // brigade instead of returning to the standing army immediately.
    const survivors: Brigade = {
      troops: Math.max(0, sent.troops - attackerLosses.troops),
      jets: Math.max(0, sent.jets - attackerLosses.jets),
      tanks: Math.max(0, sent.tanks - attackerLosses.tanks),
      turnsLeft: config.plannedStrikeRestTurns,
    };
    if (survivors.troops + survivors.jets + survivors.tanks > 0) {
      brigades = [...attacker.brigades, survivors];
      restingTurns = config.plannedStrikeRestTurns;
    }
  }
  // Every other attack type returns forces immediately — already true here
  // since `attackerMilitary` is never reduced below the sent group's
  // survivors, and no brigade is created for them.

  const nextAttacker: Nation = {
    ...attacker,
    oil: Math.max(0, attacker.oil - oilSpent),
    land: attacker.land + landCaptured,
    cash: attacker.cash + cashLooted,
    bushels: attacker.bushels + bushelsLooted,
    military: attackerMilitary,
    brigades,
  };
  const nextDefender: Nation = {
    ...defender,
    land: Math.max(0, defender.land - landCaptured),
    cash: Math.max(0, defender.cash - cashLooted),
    bushels: Math.max(0, defender.bushels - bushelsLooted),
    population: Math.max(50, defender.population - populationKilled),
    buildings: nextDefBuildings,
    military: subtract(defender.military, defenderLosses),
  };
  if (techLooted > 0) {
    nextAttacker.tech = { ...attacker.tech, militaryStrategy: attacker.tech.militaryStrategy + techLooted };
  }

  // Same rule for every nation, player included: land or army collapse ends it.
  const defenderDefeated =
    won &&
    (nextDefender.land < config.defeatLandFloor ||
      battleUnits(nextDefender.military) < config.defeatMilFloor);
  if (defenderDefeated) nextDefender.defeated = true;

  const label: Record<AttackType, string> = {
    standard: "struck",
    planned: "hit with a planned strike on",
    guerilla: "raided",
    bombing: "bombed",
    artillery: "shelled",
  };
  const log: string[] = [];
  if (won) {
    if (isLandGrab) {
      log.push(
        `${attacker.name} ${label[attackType]} ${defender.name}: captured ${landCaptured} acres, ` +
          `$${cashLooted.toLocaleString()}, ${bushelsLooted.toLocaleString()} bushels.`,
      );
    } else if (attackType === "guerilla") {
      log.push(`${attacker.name} raided ${defender.name}: ${populationKilled.toLocaleString()} killed, ${bushelsLooted.toLocaleString()} bushels lost.`);
    } else {
      log.push(`${attacker.name} ${label[attackType]} ${defender.name}, razing ${buildingsRazed} acres of buildings.`);
    }
  } else {
    log.push(`${defender.name} repelled a ${attackType} attack from ${attacker.name}.`);
  }
  if (restingTurns) log.push(`${attacker.name}'s brigade is resting for ${restingTurns} turns — unavailable to attack or defend.`);
  if (defenderDefeated) log.push(`${defender.name} has been eliminated.`);

  const result: CombatResult = {
    outcome: won ? "attacker_won" : "attacker_repelled",
    attackType,
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerName: attacker.name,
    defenderName: defender.name,
    attackerOffense: Math.round(atkEff),
    defenderDefense: Math.round(defEff),
    sent: { troops: sent.troops, jets: sent.jets, tanks: sent.tanks },
    landCaptured,
    cashLooted,
    bushelsLooted,
    techLooted,
    populationKilled,
    buildingsRazed,
    oilSpent,
    attackerLosses,
    defenderLosses,
    defenderDefeated,
    log,
  };
  if (restingTurns) result.restingTurns = restingTurns;
  return { result, attacker: nextAttacker, defender: nextDefender };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export { totalMilitary };
