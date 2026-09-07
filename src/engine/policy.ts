/** Policy player actions: tax rate, industrial production mix, research focus,
 * government. */

import { config } from "./config";
import { gov } from "./government";
import { builtAcres, razeBuildings } from "./economy";
import { TECH_CATEGORIES, UNIT_TYPES } from "./types";
import type { ActionResult, GovernmentId, Nation, ProductionMix, TechCategory } from "./types";

const ok = (nation: Nation, turnsRemaining: number, line: string): ActionResult => ({
  ok: true,
  nation,
  turnsRemaining,
  log: [line],
});
const no = (nation: Nation, turnsRemaining: number, error: string): ActionResult => ({
  ok: false,
  error,
  nation,
  turnsRemaining,
  log: [],
});

export function setTaxRate(nation: Nation, turnsRemaining: number, rate: number): ActionResult {
  if (turnsRemaining < config.turnCost.setTaxRate) return no(nation, turnsRemaining, "Not enough turns.");
  const clamped = Math.round(Math.min(config.taxRateMax, Math.max(config.taxRateMin, rate)) * 100) / 100;
  if (clamped === nation.taxRate) return no(nation, turnsRemaining, "Tax rate unchanged.");
  return ok({ ...nation, taxRate: clamped }, turnsRemaining - config.turnCost.setTaxRate, `Tax rate set to ${Math.round(clamped * 100)}%.`);
}

/** Set the Industrial Complex production split. Values are normalised to 100. */
export function setProduction(nation: Nation, turnsRemaining: number, mix: Partial<ProductionMix>): ActionResult {
  if (turnsRemaining < config.turnCost.setProduction) return no(nation, turnsRemaining, "Not enough turns.");
  const merged = { ...nation.production, ...mix };
  const sum = UNIT_TYPES.reduce((s, u) => s + Math.max(0, merged[u]), 0);
  if (sum <= 0) return no(nation, turnsRemaining, "Production must total more than zero.");
  const normalised = {} as ProductionMix;
  for (const u of UNIT_TYPES) normalised[u] = Math.round((Math.max(0, merged[u]) / sum) * 100);
  return ok({ ...nation, production: normalised }, turnsRemaining - config.turnCost.setProduction, "Industrial production reallocated.");
}

export function setResearchFocus(nation: Nation, turnsRemaining: number, focus: TechCategory): ActionResult {
  if (turnsRemaining < config.turnCost.setResearchFocus) return no(nation, turnsRemaining, "Not enough turns.");
  if (focus === nation.researchFocus) return no(nation, turnsRemaining, "Already researching that.");
  return ok({ ...nation, researchFocus: focus }, turnsRemaining - config.turnCost.setResearchFocus, `Research focus set to ${focus}.`);
}

export function setGovernment(nation: Nation, turnsRemaining: number, government: GovernmentId): ActionResult {
  if (turnsRemaining < config.turnCost.setGovernment) {
    return no(nation, turnsRemaining, `Changing government costs ${config.turnCost.setGovernment} turns.`);
  }
  if (government === nation.government) return no(nation, turnsRemaining, "Already governed that way.");

  const nextTurns = turnsRemaining - config.turnCost.setGovernment;

  // Leaving Monarchy is free. Leaving anything else — even switching straight
  // back to Monarchy — costs an instability penalty, no matter the destination.
  if (nation.government === "monarchy") {
    return ok({ ...nation, government }, nextTurns, `Government changed to ${gov(government).label}.`);
  }

  const p = config.governmentChangePenaltyPct;
  const cashLost = Math.round(nation.cash * p.cash);
  const m = nation.military;
  const military = {
    troops: Math.floor(m.troops * (1 - p.military)),
    jets: Math.floor(m.jets * (1 - p.military)),
    turrets: Math.floor(m.turrets * (1 - p.military)),
    tanks: Math.floor(m.tanks * (1 - p.military)),
    spies: m.spies,
  };
  const tech = { ...nation.tech };
  for (const c of TECH_CATEGORIES) tech[c] = Math.max(0, tech[c] * (1 - p.tech));
  const razedAcres = Math.round(builtAcres(nation) * p.buildings);
  const { buildings } = razeBuildings(nation.buildings, razedAcres);

  const next: Nation = {
    ...nation,
    government,
    cash: Math.max(0, nation.cash - cashLost),
    military,
    tech,
    buildings,
  };
  return ok(
    next,
    nextTurns,
    `Instability from leaving ${gov(nation.government).label}: -$${cashLost.toLocaleString()}, ` +
      `${Math.round(p.military * 100)}% military, ${Math.round(p.tech * 100)}% tech, ${Math.round(p.buildings * 100)}% buildings. ` +
      `Now governed as ${gov(government).label}.`,
  );
}
