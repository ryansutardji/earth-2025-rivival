/**
 * Missile strikes (Chemical / Cruise / Nuclear). Each is countered by the
 * target's SDI tech. Missiles are produced passively by Warfare tech (see
 * `economy.produceMissiles`).
 */

import { config } from "./config";
import { sdiTechChance } from "./tech";
import { battleUnits, razeBuildings } from "./economy";
import { BUILDING_TYPES } from "./types";
import type { Military, MissileResult, MissileType, Nation, Rng } from "./types";

const scaleMil = (m: Military, f: number): Military => ({
  troops: Math.floor(m.troops * f),
  jets: Math.floor(m.jets * f),
  turrets: Math.floor(m.turrets * f),
  tanks: Math.floor(m.tanks * f),
  spies: Math.floor(m.spies * f),
});

export interface MissileResolution {
  result: MissileResult;
  attacker: Nation;
  defender: Nation;
}

/** Resolve one missile launch. Consumes one RNG value (the SDI roll). */
export function resolveMissile(
  attacker: Nation,
  defender: Nation,
  missile: MissileType,
  rng: Rng,
): MissileResolution {
  const spec = config.missile;
  const oilSpent = Math.min(attacker.oil, spec.oilCost[missile]);
  const nextAttacker: Nation = { ...attacker, oil: Math.max(0, attacker.oil - oilSpent), missiles: { ...attacker.missiles, [missile]: Math.max(0, attacker.missiles[missile] - 1) } };

  const intercepted = rng() < sdiTechChance(defender);

  let landDestroyed = 0;
  let buildingsRazed = 0;
  let populationKilled = 0;
  let unitsKilled = 0;
  let nextDefender: Nation = defender;

  if (!intercepted) {
    if (missile === "chemical") {
      populationKilled = Math.floor(defender.population * spec.chemical.populationKillPct);
      const r = razeBuildings(defender.buildings, Math.floor(builtAcres(defender) * spec.chemical.buildingRazePct));
      buildingsRazed = r.razed;
      nextDefender = { ...defender, population: Math.max(50, defender.population - populationKilled), buildings: r.buildings };
    } else if (missile === "cruise") {
      const before = battleUnits(defender.military);
      const mil = scaleMil(defender.military, 1 - spec.cruise.unitKillPct);
      unitsKilled = before - battleUnits(mil);
      nextDefender = { ...defender, military: mil };
    } else {
      landDestroyed = Math.max(spec.nuclear.minLand, Math.floor(defender.land * spec.nuclear.landDestroyPct));
      landDestroyed = Math.min(landDestroyed, defender.land);
      populationKilled = Math.floor(defender.population * spec.nuclear.populationKillPct);
      const r = razeBuildings(defender.buildings, Math.floor(builtAcres(defender) * spec.nuclear.buildingRazePct));
      buildingsRazed = r.razed;
      nextDefender = {
        ...defender,
        land: Math.max(0, defender.land - landDestroyed),
        population: Math.max(50, defender.population - populationKilled),
        buildings: r.buildings,
      };
    }
  }

  // Same rule for every nation, player included: land or army collapse ends it.
  const defenderDefeated =
    !intercepted &&
    (nextDefender.land < config.defeatLandFloor || battleUnits(nextDefender.military) < config.defeatMilFloor);
  if (defenderDefeated) nextDefender = { ...nextDefender, defeated: true };

  const log: string[] = [];
  if (intercepted) {
    log.push(`${defender.name}'s SDI intercepted a ${missile} missile from ${attacker.name}.`);
  } else if (missile === "chemical") {
    log.push(`${attacker.name}'s chemical missile hit ${defender.name}: ${populationKilled.toLocaleString()} dead, ${buildingsRazed} acres razed.`);
  } else if (missile === "cruise") {
    log.push(`${attacker.name}'s cruise missile hit ${defender.name}: ${unitsKilled.toLocaleString()} units destroyed.`);
  } else {
    log.push(`${attacker.name} NUKED ${defender.name}: ${landDestroyed} acres and ${populationKilled.toLocaleString()} people gone.`);
  }
  if (defenderDefeated) log.push(`${defender.name} has been eliminated.`);

  const result: MissileResult = {
    missile,
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerName: attacker.name,
    defenderName: defender.name,
    intercepted,
    landDestroyed,
    buildingsRazed,
    populationKilled,
    unitsKilled,
    defenderDefeated,
    log,
  };
  return { result, attacker: nextAttacker, defender: nextDefender };
}

function builtAcres(n: Nation): number {
  return BUILDING_TYPES.reduce((s, k) => s + n.buildings[k], 0);
}
