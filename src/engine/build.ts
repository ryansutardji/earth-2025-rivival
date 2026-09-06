/** The "build" player action: convert empty acres into a building type.
 *
 * Earth Empires: cost per building scales with total land; how many acres you
 * can build in one turn is Buildings-Per-Turn (BPT), set by Construction Sites
 * and the government's build-rate modifier. (Construction Sites in EE cost 1
 * turn *each*; here they build at the BPT rate too, for a compressed season.) */

import { config } from "./config";
import { gov } from "./government";
import { emptyAcres } from "./economy";
import type { ActionResult, Buildings, Nation } from "./types";

export interface BuildParams {
  type: keyof Buildings;
  acres: number;
}

/** Cash to construct one building, proportionate to total acres. */
export function costPerBuilding(nation: Nation): number {
  return Math.round(config.buildCostBase + nation.land * config.buildCostPerLandAcre);
}

/** Acres a nation can build in a single turn. */
export function buildingsPerTurn(nation: Nation): number {
  const raw = (config.bptBase + nation.buildings.constructionSites * config.bptPerSite) * gov(nation.government).buildRateMult;
  return Math.max(1, Math.round(raw));
}

const fail = (nation: Nation, turnsRemaining: number, error: string): ActionResult => ({
  ok: false,
  error,
  nation,
  turnsRemaining,
  log: [],
});

export function build(nation: Nation, turnsRemaining: number, params: BuildParams): ActionResult {
  const requested = Math.floor(params.acres);
  if (requested <= 0) return fail(nation, turnsRemaining, "Enter a positive number of acres.");
  if (turnsRemaining < config.turnCost.build) return fail(nation, turnsRemaining, "Not enough turns.");

  const acres = Math.min(requested, buildingsPerTurn(nation), emptyAcres(nation));
  if (acres <= 0) return fail(nation, turnsRemaining, "No empty land. Explore for more.");

  const cost = acres * costPerBuilding(nation);
  if (nation.cash < cost) {
    return fail(nation, turnsRemaining, `Need $${cost.toLocaleString()} to build ${acres} acres.`);
  }

  const next: Nation = {
    ...nation,
    cash: nation.cash - cost,
    buildings: { ...nation.buildings, [params.type]: nation.buildings[params.type] + acres },
  };
  return {
    ok: true,
    nation: next,
    turnsRemaining: turnsRemaining - config.turnCost.build,
    log: [`Built ${acres} acres of ${params.type} for $${cost.toLocaleString()}.`],
  };
}

/** The "demolish" player action: raze built acres for a small refund. */
export function demolish(nation: Nation, turnsRemaining: number, params: BuildParams): ActionResult {
  const acres = Math.min(Math.floor(params.acres), nation.buildings[params.type]);
  if (acres <= 0) return fail(nation, turnsRemaining, "Nothing to demolish there.");
  if (turnsRemaining < config.turnCost.build) return fail(nation, turnsRemaining, "Not enough turns.");
  const refund = Math.round(acres * costPerBuilding(nation) * config.demolishRefundPct);
  const next: Nation = {
    ...nation,
    cash: nation.cash + refund,
    buildings: { ...nation.buildings, [params.type]: nation.buildings[params.type] - acres },
  };
  return {
    ok: true,
    nation: next,
    turnsRemaining: turnsRemaining - config.turnCost.build,
    log: [`Demolished ${acres} acres of ${params.type} (+$${refund.toLocaleString()}).`],
  };
}
