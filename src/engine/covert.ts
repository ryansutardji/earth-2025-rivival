/**
 * Covert operations — Earth Empires spy ops. Success is a probability roll from
 * the attacker's SPAL (spies per acre) × Spy tech × government vs the defender's
 * counter-intel. Repeated *harmful* ops on the same target build "heat" that
 * cuts your success (wiki: diminishing returns); the `spy` report op has none.
 */

import { config } from "./config";
import { gov } from "./government";
import { spyTechMult } from "./tech";
import { razeBuildings, spal } from "./economy";
import { netWorth } from "./networth";
import { TECH_CATEGORIES } from "./types";
import type { CovertOp, CovertResult, EnemyIntel, Nation, Rng } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const HARMFUL: readonly CovertOp[] = [
  "espionage",
  "bombBuildings",
  "raidFoodStores",
  "sabotageIntelligence",
  "causeDissensions",
];
export const isHarmful = (op: CovertOp): boolean => HARMFUL.includes(op);

export function covertOffense(attacker: Nation, op: CovertOp): number {
  const g = gov(attacker.government);
  return (
    (spal(attacker) + config.covert.baseCounterIntel) *
    spyTechMult(attacker) *
    (1 + g.spyEffectivenessBonus) *
    config.covert.opFactor[op]
  );
}

export function covertDefense(defender: Nation): number {
  const g = gov(defender.government);
  return (
    (spal(defender) * config.covert.spyDefWeight + config.covert.baseCounterIntel) *
    spyTechMult(defender) *
    (1 + g.spyEffectivenessBonus)
  );
}

/** Success chance for `op` on `defender`, given the target's current heat. */
export function covertSuccessChance(attacker: Nation, defender: Nation, op: CovertOp, heat = 0): number {
  const off = covertOffense(attacker, op);
  const def = covertDefense(defender);
  const raw = off / (off + def);
  const penalty = isHarmful(op) ? heat * config.covert.heatSuccessPenalty : 0;
  return clamp(raw - penalty, config.covert.minSuccess, config.covert.maxSuccess);
}

export function snapshotIntel(n: Nation, day: number): EnemyIntel {
  return {
    day,
    land: n.land,
    population: n.population,
    bushels: n.bushels,
    oil: n.oil,
    cash: n.cash,
    buildings: { ...n.buildings },
    military: { ...n.military },
    missiles: { ...n.missiles },
    tech: { ...n.tech },
    government: n.government,
    netWorth: netWorth(n),
  };
}

export interface CovertResolution {
  result: CovertResult;
  attacker: Nation;
  defender: Nation;
}

/** Resolve one covert op. Consumes two RNG values: success roll, then detection. */
export function resolveCovertOp(
  attacker: Nation,
  defender: Nation,
  op: CovertOp,
  day: number,
  rng: Rng,
  heat = 0,
): CovertResolution {
  const c = config.covert;
  const chance = covertSuccessChance(attacker, defender, op, heat);
  const success = rng() < chance;
  const wasDetected = rng() < (success ? c.detectChanceOnSuccess : c.detectChanceOnFail);

  let spiesLost = 0;
  let techStolen = 0;
  let bushelsRaided = 0;
  let buildingsSabotaged = 0;
  let troopsDeserted = 0;
  let spiesSabotaged = 0;
  let intel: EnemyIntel | undefined;
  let nextDefender = defender;
  let nextAttacker = attacker;

  if (success) {
    spiesLost = Math.floor(attacker.military.spies * c.successSpyLossPct);
    if (op === "spy") {
      intel = snapshotIntel(defender, day);
    } else if (op === "espionage") {
      // Steal points from the target's strongest area into the attacker's Military Strategy.
      const best = [...TECH_CATEGORIES].sort((a, b) => defender.tech[b] - defender.tech[a])[0]!;
      techStolen = Math.floor(defender.tech[best] * c.espionageTechPct);
      nextDefender = { ...defender, tech: { ...defender.tech, [best]: defender.tech[best] - techStolen } };
      nextAttacker = { ...attacker, tech: { ...attacker.tech, militaryStrategy: attacker.tech.militaryStrategy + techStolen } };
    } else if (op === "bombBuildings") {
      const wanted = Math.max(Math.floor(defender.buildings.industrialComplexes * c.bombBuildingsPct) + Math.floor(defender.buildings.enterpriseZones * c.bombBuildingsPct), c.bombBuildingsMinAcres);
      const r = razeBuildings(defender.buildings, wanted);
      buildingsSabotaged = r.razed;
      nextDefender = { ...defender, buildings: r.buildings };
    } else if (op === "raidFoodStores") {
      const destroyed = Math.floor(defender.bushels * c.raidBushelsDestroyPct);
      bushelsRaided = Math.floor(defender.bushels * c.raidBushelsCapturePct);
      nextDefender = { ...defender, bushels: Math.max(0, defender.bushels - destroyed - bushelsRaided) };
      nextAttacker = { ...attacker, bushels: attacker.bushels + bushelsRaided };
    } else if (op === "sabotageIntelligence") {
      spiesSabotaged = Math.floor(defender.military.spies * c.sabotageSpiesPct);
      nextDefender = { ...defender, military: { ...defender.military, spies: Math.max(0, defender.military.spies - spiesSabotaged) } };
    } else {
      troopsDeserted = Math.floor(defender.military.troops * c.dissentTroopsPct);
      nextDefender = { ...defender, military: { ...defender.military, troops: Math.max(0, defender.military.troops - troopsDeserted) } };
    }
  } else {
    spiesLost = Math.ceil(attacker.military.spies * c.failSpyLossPct);
  }

  nextAttacker = {
    ...nextAttacker,
    military: { ...nextAttacker.military, spies: Math.max(0, nextAttacker.military.spies - spiesLost) },
  };

  const log: string[] = [];
  const who = wasDetected ? attacker.name : "an unknown power";
  if (success) {
    if (op === "spy") log.push(`${attacker.name}'s agents compiled a full report on ${defender.name}.`);
    else if (op === "espionage") log.push(`${attacker.name} stole ${techStolen.toLocaleString()} tech points from ${defender.name}.`);
    else if (op === "bombBuildings") log.push(`Saboteurs wrecked ${buildingsSabotaged} acres of buildings in ${defender.name}.`);
    else if (op === "raidFoodStores") log.push(`${attacker.name} raided ${defender.name}'s granaries — ${bushelsRaided.toLocaleString()} bushels seized.`);
    else if (op === "sabotageIntelligence") log.push(`${attacker.name} assassinated ${spiesSabotaged.toLocaleString()} of ${defender.name}'s spies.`);
    else log.push(`${troopsDeserted.toLocaleString()} of ${defender.name}'s troops deserted after ${attacker.name}'s agitators got to work.`);
  } else {
    log.push(`${defender.name} foiled a covert op by ${who}; ${spiesLost.toLocaleString()} spies lost.`);
  }

  const result: CovertResult = {
    op,
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerName: attacker.name,
    defenderName: defender.name,
    success,
    detected: wasDetected,
    successChance: chance,
    spiesLost,
    techStolen,
    bushelsRaided,
    buildingsSabotaged,
    troopsDeserted,
    spiesSabotaged,
    log,
  };
  if (intel) result.intel = intel;
  return { result, attacker: nextAttacker, defender: nextDefender };
}
