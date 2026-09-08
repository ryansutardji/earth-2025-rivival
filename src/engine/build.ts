/** The "build" player action: convert empty acres into a building type.
 *
 * Turns are a pool, not a per-action cost: one build order places as many
 * acres as you ask for (of a single type) and spends `ceil(acres ÷ build
 * rate)` turns doing it — a partly-used turn still counts as a whole turn.
 * The build rate (Buildings-Per-Turn) is set by Construction Sites and the
 * government's build-rate modifier. Construction Sites themselves are the
 * exception: they always build at 1 per turn, ignoring BPT and government
 * (you can't bootstrap your build rate in bulk). The order is capped by
 * empty land, cash on hand, and turns remaining, whichever binds first. */

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

/** Acres of `type` a nation can build in a single turn. Construction Sites are
 * always 1/turn; every other building runs at BPT = (base + sites) × govt
 * build-rate. Pass `type` to get the right answer; omit it for the raw BPT. */
export function buildingsPerTurn(nation: Nation, type?: keyof Buildings): number {
  if (type === "constructionSites") return 1;
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

/** Turns a build order for `acres` of `type` would spend at this nation's
 * current rate: `ceil(acres ÷ rate)`, minimum 1. */
export function buildTurnCost(nation: Nation, type: keyof Buildings, acres: number): number {
  if (!Number.isFinite(acres) || acres <= 0) return 1;
  return Math.max(1, Math.ceil(acres / buildingsPerTurn(nation, type)));
}

export function build(nation: Nation, turnsRemaining: number, params: BuildParams): ActionResult {
  const requested = Math.floor(params.acres);
  if (requested <= 0) return fail(nation, turnsRemaining, "Enter a positive number of acres.");
  if (turnsRemaining < config.turnCost.build) return fail(nation, turnsRemaining, "Not enough turns.");
  if (emptyAcres(nation) <= 0) return fail(nation, turnsRemaining, "No empty land. Explore for more.");

  const rate = buildingsPerTurn(nation, params.type);
  const perAcre = costPerBuilding(nation);
  // Cap by land / cash / turns, whichever binds first, then bill the turns it
  // actually takes (a partly-used turn is a whole turn).
  const byLand = emptyAcres(nation);
  const byCash = Math.floor(nation.cash / perAcre);
  const byTurns = turnsRemaining * rate;
  const acres = Math.min(requested, byLand, byCash, byTurns);
  if (acres <= 0) return fail(nation, turnsRemaining, `Need $${perAcre.toLocaleString()} to build even one acre.`);

  const turnsUsed = Math.ceil(acres / rate);
  const cost = acres * perAcre;

  // If we couldn't do the whole request, say why — otherwise a silent clamp
  // (usually "out of cash") looks like a bug.
  let shortfall = "";
  if (acres < requested) {
    const reason =
      byCash <= byLand && byCash <= byTurns
        ? "out of cash"
        : byLand <= byTurns
          ? "no empty land left"
          : "out of turns this day";
    shortfall = ` — ${reason}, ${requested - acres} of ${requested} not built`;
  }

  const next: Nation = {
    ...nation,
    cash: nation.cash - cost,
    buildings: { ...nation.buildings, [params.type]: nation.buildings[params.type] + acres },
  };
  return {
    ok: true,
    nation: next,
    turnsRemaining: turnsRemaining - turnsUsed,
    log: [`Built ${acres} acres of ${params.type} for $${cost.toLocaleString()} (${turnsUsed} turn${turnsUsed === 1 ? "" : "s"})${shortfall}.`],
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
