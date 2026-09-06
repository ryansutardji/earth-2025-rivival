/**
 * The public market: a single-player stand-in for Earth 2025's player-driven
 * exchange. Each good has a floating `price` and a finite `stock`. Every world
 * tick the price mean-reverts toward its baseline with a little noise and the
 * stock restocks toward its cap. Your own trades move both: buying lifts the
 * price and drains stock; selling does the reverse.
 *
 * Cheaper than the private market, but you can only buy what's in stock and the
 * price is never quite what you'd like.
 */

import { config } from "./config";
import { rngFromSeed } from "./rng";
import { MARKET_GOODS } from "./types";
import type { MarketEntry, MarketGood, MarketState, Military, Nation, Rng } from "./types";

export { MARKET_GOODS };
export type { MarketEntry, MarketGood, MarketState };

const UNIT_GOODS: readonly (keyof Military)[] = ["troops", "turrets", "jets", "tanks", "spies"];
const isUnit = (g: MarketGood): g is keyof Military => (UNIT_GOODS as readonly string[]).includes(g);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How much of a good a nation currently holds (units → military, else stockpile). */
export function holdingOf(n: Nation, good: MarketGood): number {
  if (isUnit(good)) return n.military[good];
  return good === "bushels" ? n.bushels : n.oil;
}

function withHolding(n: Nation, good: MarketGood, delta: number): Nation {
  if (isUnit(good)) {
    return { ...n, military: { ...n.military, [good]: Math.max(0, n.military[good] + delta) } };
  }
  if (good === "bushels") return { ...n, bushels: Math.max(0, n.bushels + delta) };
  return { ...n, oil: Math.max(0, n.oil + delta) };
}

/** Deterministic starting market for a season. */
export function initialMarket(seed: number): MarketState {
  const rng = rngFromSeed(seed ^ 0x1d872b41).next;
  const out = {} as MarketState;
  for (const g of MARKET_GOODS) {
    const spec = config.market.goods[g];
    out[g] = {
      price: Math.round(spec.base * (0.9 + rng() * 0.2) * 100) / 100,
      stock: Math.round(spec.stockCap * (0.45 + rng() * 0.4)),
    };
  }
  return out;
}

/** One market tick: mean-reversion + noise on price, restock toward the cap. */
export function tickMarket(market: MarketState, rng: Rng): MarketState {
  const m = config.market;
  const next = {} as MarketState;
  for (const g of MARKET_GOODS) {
    const spec = m.goods[g];
    const cur = market[g];
    const noise = cur.price * m.volatility * (rng() * 2 - 1);
    let price = cur.price + (spec.base - cur.price) * m.revertRate + noise;
    price = clamp(price, spec.base * m.minPriceFactor, spec.base * m.maxPriceFactor);
    next[g] = {
      price: Math.round(price * 100) / 100,
      stock: Math.min(spec.stockCap, cur.stock + spec.restock),
    };
  }
  return next;
}

export function buyPrice(entry: MarketEntry): number {
  return Math.round(entry.price * (1 + config.market.spread) * 100) / 100;
}

export function sellPrice(entry: MarketEntry): number {
  return Math.round(entry.price * (1 - config.market.spread) * 100) / 100;
}

/** Price move (fraction) for filling `qty` against a good with cap `stockCap`. */
function priceImpact(qty: number, stockCap: number): number {
  return clamp((qty / stockCap) * config.market.priceImpactPerFill, 0, config.market.priceImpactPerFill);
}

export interface MarketActionResult {
  ok: boolean;
  error?: string;
  nation: Nation;
  market: MarketState;
  turnsRemaining: number;
  log: string[];
}

const fail = (nation: Nation, market: MarketState, turnsRemaining: number, error: string): MarketActionResult => ({
  ok: false,
  error,
  nation,
  market,
  turnsRemaining,
  log: [],
});

export function marketBuy(
  nation: Nation,
  market: MarketState,
  turnsRemaining: number,
  good: MarketGood,
  qty: number,
): MarketActionResult {
  const n = Math.floor(qty);
  if (n <= 0) return fail(nation, market, turnsRemaining, "Enter a positive quantity.");
  if (turnsRemaining < config.turnCost.marketTrade) return fail(nation, market, turnsRemaining, "Not enough turns.");

  const entry = market[good];
  if (n > entry.stock) return fail(nation, market, turnsRemaining, `Only ${Math.floor(entry.stock).toLocaleString()} ${good} in stock.`);

  const unitPrice = buyPrice(entry);
  const cost = Math.ceil(unitPrice * n);
  if (nation.cash < cost) return fail(nation, market, turnsRemaining, `Need $${cost.toLocaleString()}.`);

  const spec = config.market.goods[good];
  const nextEntry: MarketEntry = {
    price: Math.round(entry.price * (1 + priceImpact(n, spec.stockCap)) * 100) / 100,
    stock: entry.stock - n,
  };
  return {
    ok: true,
    nation: withHolding({ ...nation, cash: nation.cash - cost }, good, n),
    market: { ...market, [good]: nextEntry },
    turnsRemaining: turnsRemaining - config.turnCost.marketTrade,
    log: [`Bought ${n.toLocaleString()} ${good} on the market for $${cost.toLocaleString()}.`],
  };
}

export function marketSell(
  nation: Nation,
  market: MarketState,
  turnsRemaining: number,
  good: MarketGood,
  qty: number,
): MarketActionResult {
  const n = Math.floor(qty);
  if (n <= 0) return fail(nation, market, turnsRemaining, "Enter a positive quantity.");
  if (turnsRemaining < config.turnCost.marketTrade) return fail(nation, market, turnsRemaining, "Not enough turns.");
  if (holdingOf(nation, good) < n) return fail(nation, market, turnsRemaining, `You don't have ${n.toLocaleString()} ${good}.`);

  const entry = market[good];
  const spec = config.market.goods[good];
  const proceeds = Math.floor(sellPrice(entry) * n);
  const nextEntry: MarketEntry = {
    price: Math.round(entry.price * (1 - priceImpact(n, spec.stockCap)) * 100) / 100,
    stock: Math.min(spec.stockCap, entry.stock + n),
  };
  return {
    ok: true,
    nation: withHolding({ ...nation, cash: nation.cash + proceeds }, good, -n),
    market: { ...market, [good]: nextEntry },
    turnsRemaining: turnsRemaining - config.turnCost.marketTrade,
    log: [`Sold ${n.toLocaleString()} ${good} on the market for $${proceeds.toLocaleString()}.`],
  };
}
