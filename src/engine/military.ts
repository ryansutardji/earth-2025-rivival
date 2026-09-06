/**
 * The private-market "buy units" player action: instant, cash only, at the wiki
 * base prices, discounted by Military tech + Military Bases + government.
 * Spies cannot be bought — only Industrial Complexes make them.
 */

import { config } from "./config";
import { gov } from "./government";
import { militaryCostTechMult } from "./tech";
import type { ActionResult, Military, Nation } from "./types";

export type UnitType = keyof Military;

export interface BuyParams {
  type: UnitType;
  qty: number;
}

/** Current private-market buy price for one unit of `type`. */
export function privateBuyPrice(nation: Nation, type: UnitType): number {
  const baseCut = Math.min(
    config.militaryBaseUpkeepCap,
    (nation.buildings.militaryBases / Math.max(1, nation.land)) * config.militaryBaseUpkeepFactor,
  );
  return Math.round(
    config.unitCost[type] * militaryCostTechMult(nation) * gov(nation.government).militaryCostMult * (1 - baseCut),
  );
}

export function buyMilitary(nation: Nation, turnsRemaining: number, params: BuyParams): ActionResult {
  const qty = Math.floor(params.qty);
  if (params.type === "spies") {
    return { ok: false, error: "Spies can only be produced by Industrial Complexes.", nation, turnsRemaining, log: [] };
  }
  if (qty <= 0) return { ok: false, error: "Enter a positive quantity.", nation, turnsRemaining, log: [] };
  if (qty > config.maxBuyPerAction) {
    return { ok: false, error: `Can buy at most ${config.maxBuyPerAction} per action.`, nation, turnsRemaining, log: [] };
  }
  if (turnsRemaining < config.turnCost.buyMilitary) {
    return { ok: false, error: "Not enough turns.", nation, turnsRemaining, log: [] };
  }
  const cost = qty * privateBuyPrice(nation, params.type);
  if (nation.cash < cost) {
    return { ok: false, error: `Need $${cost.toLocaleString()}.`, nation, turnsRemaining, log: [] };
  }
  return {
    ok: true,
    nation: {
      ...nation,
      cash: nation.cash - cost,
      military: { ...nation.military, [params.type]: nation.military[params.type] + qty },
    },
    turnsRemaining: turnsRemaining - config.turnCost.buyMilitary,
    log: [`Bought ${qty.toLocaleString()} ${params.type} for $${cost.toLocaleString()}.`],
  };
}
