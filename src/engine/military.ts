/**
 * The private market — the only market in the game. Instant, cash only, one
 * turn per purchase regardless of quantity, no selling.
 *
 *  - Units (`buyMilitary`): wiki base prices, discounted by Military tech +
 *    Military Bases + government. Spies cannot be bought — only Industrial
 *    Complexes make them.
 *  - Bushels / oil (`buyResource`): flat `config.resourceCost` price.
 */

import { config } from "./config";
import { gov } from "./government";
import { militaryBaseCostCut } from "./economy";
import { militaryCostTechMult } from "./tech";
import type { ActionResult, Military, Nation } from "./types";

export type UnitType = keyof Military;
export type ResourceGood = "bushels" | "oil";

export interface BuyParams {
  type: UnitType;
  qty: number;
}

/** Current private-market buy price for one unit of `type`. */
export function privateBuyPrice(nation: Nation, type: UnitType): number {
  return Math.round(
    config.unitCost[type] *
      militaryCostTechMult(nation) *
      gov(nation.government).militaryCostMult *
      (1 - militaryBaseCostCut(nation)),
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

/** Flat private-market price for one unit of bushels / oil (no discounts). */
export function resourceBuyPrice(good: ResourceGood): number {
  return config.resourceCost[good];
}

export interface BuyResourceParams {
  good: ResourceGood;
  qty: number;
}

/** Buy bushels or oil for cash — one turn regardless of quantity, no cap. */
export function buyResource(nation: Nation, turnsRemaining: number, params: BuyResourceParams): ActionResult {
  const qty = Math.floor(params.qty);
  if (qty <= 0) return { ok: false, error: "Enter a positive quantity.", nation, turnsRemaining, log: [] };
  if (turnsRemaining < config.turnCost.buyMilitary) {
    return { ok: false, error: "Not enough turns.", nation, turnsRemaining, log: [] };
  }
  const cost = qty * resourceBuyPrice(params.good);
  if (nation.cash < cost) {
    return { ok: false, error: `Need $${cost.toLocaleString()}.`, nation, turnsRemaining, log: [] };
  }
  return {
    ok: true,
    nation: { ...nation, cash: nation.cash - cost, [params.good]: nation[params.good] + qty },
    turnsRemaining: turnsRemaining - config.turnCost.buyMilitary,
    log: [`Bought ${qty.toLocaleString()} ${params.good} for $${cost.toLocaleString()}.`],
  };
}
