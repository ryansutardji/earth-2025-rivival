/** The "explore" player action: spend a turn to gain land. Turns-only (no cash
 * cost). Acres-per-turn come from the Earth Empires explore table, keyed to
 * total land; Republics use the higher table — then scaled by
 * `seasonPacingMult`, same as every other resource rate, so land grows at the
 * same relative pace on a 60-day season as it does on a 30-day one. */

import { config } from "./config";
import { seasonPacingMult } from "./pacing";
import { exploreRate } from "../data/exploreRates";
import type { ActionResult, Nation } from "./types";

/** Acres a single explore turn adds for this nation right now. */
export function exploreYield(nation: Nation, seasonLengthDays: number = config.pacingBaselineSeasonDays): number {
  const base = exploreRate(nation.land, nation.government === "republic");
  return Math.max(1, Math.round(base * seasonPacingMult(seasonLengthDays)));
}

export function explore(
  nation: Nation,
  turnsRemaining: number,
  seasonLengthDays: number = config.pacingBaselineSeasonDays,
): ActionResult {
  if (turnsRemaining < config.turnCost.explore) {
    return { ok: false, error: "Not enough turns.", nation, turnsRemaining, log: [] };
  }
  const gained = exploreYield(nation, seasonLengthDays);
  return {
    ok: true,
    nation: { ...nation, land: nation.land + gained },
    turnsRemaining: turnsRemaining - config.turnCost.explore,
    log: [`Explored and claimed ${gained} acres of new land.`],
  };
}
