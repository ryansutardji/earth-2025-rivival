import { describe, it, expect } from "vitest";
import {
  initialMarket,
  tickMarket,
  marketBuy,
  marketSell,
  buyPrice,
  sellPrice,
  holdingOf,
  MARKET_GOODS,
} from "./market";
import { config } from "./config";
import { makeNation } from "./factory";
import { rngFromSeed } from "./rng";
import type { MarketState } from "./types";

describe("market state", () => {
  it("initialMarket is deterministic for a seed and stocks every good", () => {
    const a = initialMarket(4242);
    const b = initialMarket(4242);
    expect(a).toEqual(b);
    for (const g of MARKET_GOODS) {
      expect(a[g].price).toBeGreaterThan(0);
      expect(a[g].stock).toBeGreaterThan(0);
    }
  });

  it("tickMarket restocks toward the cap and keeps price inside its band", () => {
    const m0 = initialMarket(7);
    // Drain a good, then tick many times.
    let m: MarketState = { ...m0, jets: { price: m0.jets.price, stock: 0 } };
    const rng = rngFromSeed(1).next;
    for (let i = 0; i < 200; i++) m = tickMarket(m, rng);
    const spec = config.market.goods.jets;
    expect(m.jets.stock).toBeGreaterThan(0);
    expect(m.jets.stock).toBeLessThanOrEqual(spec.stockCap);
    expect(m.jets.price).toBeGreaterThanOrEqual(spec.base * config.market.minPriceFactor - 0.01);
    expect(m.jets.price).toBeLessThanOrEqual(spec.base * config.market.maxPriceFactor + 0.01);
  });

  it("price mean-reverts toward baseline over time", () => {
    const spec = config.market.goods.oil;
    let m: MarketState = { ...initialMarket(3), oil: { price: spec.base * 2.4, stock: spec.stockCap } };
    const rng = rngFromSeed(9).next;
    for (let i = 0; i < 400; i++) m = tickMarket(m, rng);
    expect(Math.abs(m.oil.price - spec.base)).toBeLessThan(spec.base * 0.6);
  });

  it("buy price is above sell price (spread)", () => {
    const m = initialMarket(11);
    for (const g of MARKET_GOODS) expect(buyPrice(m[g])).toBeGreaterThan(sellPrice(m[g]));
  });
});

describe("marketBuy / marketSell", () => {
  it("buying units adds them, costs cash, drains stock and lifts the price", () => {
    const m = initialMarket(1);
    const n = makeNation({ cash: 1_000_000, military: { jets: 0 } });
    const r = marketBuy(n, m, 10, "jets", 500);
    expect(r.ok).toBe(true);
    expect(r.nation.military.jets).toBe(500);
    expect(r.nation.cash).toBeLessThan(1_000_000);
    expect(r.market.jets.stock).toBe(m.jets.stock - 500);
    expect(r.market.jets.price).toBeGreaterThan(m.jets.price);
    expect(r.turnsRemaining).toBe(10 - config.turnCost.marketTrade);
  });

  it("buying food/oil adds to the stockpile", () => {
    const m = initialMarket(1);
    const n = makeNation({ cash: 1_000_000, bushels: 100, oil: 100 });
    expect(marketBuy(n, m, 10, "bushels", 5000).nation.bushels).toBe(5100);
    expect(marketBuy(n, m, 10, "oil", 2000).nation.oil).toBe(2100);
  });

  it("rejects buying more than the available stock", () => {
    const m = initialMarket(1);
    const n = makeNation({ cash: 10 ** 12 });
    const r = marketBuy(n, m, 10, "spies", m.spies.stock + 1);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/stock/i);
  });

  it("rejects buying with insufficient cash", () => {
    const m = initialMarket(1);
    const r = marketBuy(makeNation({ cash: 5 }), m, 10, "jets", 100);
    expect(r.ok).toBe(false);
  });

  it("selling removes the good, pays cash, restocks and drops the price", () => {
    const m = initialMarket(2);
    const n = makeNation({ cash: 0, military: { turrets: 1000 } });
    const r = marketSell(n, m, 10, "turrets", 400);
    expect(r.ok).toBe(true);
    expect(r.nation.military.turrets).toBe(600);
    expect(r.nation.cash).toBeGreaterThan(0);
    expect(r.market.turrets.stock).toBe(m.turrets.stock + 400);
    expect(r.market.turrets.price).toBeLessThan(m.turrets.price);
  });

  it("rejects selling what you don't have", () => {
    const m = initialMarket(2);
    const r = marketSell(makeNation({ military: { tanks: 3 } }), m, 10, "tanks", 10);
    expect(r.ok).toBe(false);
  });

  it("holdingOf reads units from military and food/oil from the stockpile", () => {
    const n = makeNation({ military: { jets: 12 }, bushels: 34, oil: 56 });
    expect(holdingOf(n, "jets")).toBe(12);
    expect(holdingOf(n, "bushels")).toBe(34);
    expect(holdingOf(n, "oil")).toBe(56);
  });

  it("buy-then-sell round trip loses money to the spread (no free arbitrage)", () => {
    const m = initialMarket(5);
    const n = makeNation({ cash: 500_000, military: { jets: 0 } });
    const bought = marketBuy(n, m, 10, "jets", 300);
    const sold = marketSell(bought.nation, bought.market, 10, "jets", 300);
    expect(sold.nation.cash).toBeLessThan(n.cash);
  });
});
