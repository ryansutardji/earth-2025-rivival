import { describe, it, expect } from "vitest";
import { build, demolish, buildingsPerTurn, costPerBuilding } from "./build";
import { explore, exploreYield } from "./explore";
import { buyMilitary, privateBuyPrice } from "./military";
import { config } from "./config";
import { makeNation } from "./factory";
import { emptyAcres } from "./economy";

describe("build action", () => {
  const rich = () => makeNation({ land: 1000, buildings: { enterpriseZones: 100 }, cash: 5_000_000 });

  it("converts empty acres, capped by buildings-per-turn, charging land-scaled cost", () => {
    const n = rich();
    const bpt = buildingsPerTurn(n);
    const r = build(n, 5, { type: "industrialComplexes", acres: 999 });
    expect(r.ok).toBe(true);
    expect(r.nation.buildings.industrialComplexes).toBe(bpt); // clamped to BPT
    expect(r.nation.cash).toBe(5_000_000 - bpt * costPerBuilding(n));
  });

  it("Construction Sites raise BPT; Dictatorship lowers it", () => {
    expect(buildingsPerTurn(makeNation({ buildings: { constructionSites: 40 } }))).toBeGreaterThan(
      buildingsPerTurn(makeNation({ buildings: { constructionSites: 0 } })),
    );
    expect(buildingsPerTurn(makeNation({ government: "dictatorship" }))).toBeLessThan(
      buildingsPerTurn(makeNation({ government: "monarchy" })),
    );
  });

  it("cost per building scales with total land", () => {
    expect(costPerBuilding(makeNation({ land: 8000 }))).toBeGreaterThan(costPerBuilding(makeNation({ land: 1000 })));
  });

  it("rejects when land or cash is short", () => {
    const full = makeNation({ land: 100, buildings: { enterpriseZones: 100 }, cash: 10 ** 9 });
    expect(emptyAcres(full)).toBe(0);
    expect(build(full, 5, { type: "farms", acres: 10 }).ok).toBe(false);
    expect(build(makeNation({ land: 1000, cash: 5 }), 5, { type: "farms", acres: 5 }).ok).toBe(false);
  });

  it("demolish refunds a fraction and frees the acres", () => {
    const n = makeNation({ land: 1000, buildings: { farms: 200 }, cash: 0 });
    const r = demolish(n, 5, { type: "farms", acres: 50 });
    expect(r.ok).toBe(true);
    expect(r.nation.buildings.farms).toBe(150);
    expect(r.nation.cash).toBe(Math.round(50 * costPerBuilding(n) * config.demolishRefundPct));
  });
});

describe("explore action (Earth Empires table)", () => {
  it("acres per turn come from the table and taper as land grows; Republic gets more", () => {
    expect(exploreYield(makeNation({ land: 1400 }))).toBe(45);
    expect(exploreYield(makeNation({ land: 12_000 }))).toBeLessThan(15);
    expect(exploreYield(makeNation({ land: 1400, government: "republic" }))).toBeGreaterThan(45);
  });

  it("adds land for a turn, no cash cost", () => {
    const n = makeNation({ land: 1400, cash: 100 });
    const r = explore(n, 5);
    expect(r.ok).toBe(true);
    expect(r.nation.land).toBe(1400 + exploreYield(n));
    expect(r.nation.cash).toBe(100);
    expect(r.turnsRemaining).toBe(5 - config.turnCost.explore);
  });

  it("scales with season length, same as every other resource rate", () => {
    const n = makeNation({ land: 1400 });
    // Base rate at this land total is 45/turn, tuned for a 30-day season.
    expect(exploreYield(n, 30)).toBe(45);
    expect(exploreYield(n, 15)).toBe(90); // half the season => double the rate
    expect(exploreYield(n, 60)).toBe(23); // double the season => half the rate
    expect(exploreYield(n, 6000)).toBeGreaterThanOrEqual(1); // never rounds to 0
  });
});

describe("private market", () => {
  it("uses the wiki base prices, discounted by Military tech / Military Bases / government", () => {
    expect(privateBuyPrice(makeNation({ government: "monarchy" }), "tanks")).toBe(config.unitCost.tanks);
    expect(privateBuyPrice(makeNation({ tech: { military: 6000 } }), "tanks")).toBeLessThan(config.unitCost.tanks);
    expect(privateBuyPrice(makeNation({ land: 1000, buildings: { militaryBases: 200 } }), "tanks")).toBeLessThan(config.unitCost.tanks);
  });

  it("buys units for cash; refuses to sell you spies", () => {
    const n = makeNation({ cash: 1_000_000, government: "monarchy" });
    const r = buyMilitary(n, 5, { type: "jets", qty: 10 });
    expect(r.nation.military.jets).toBe(10);
    expect(r.nation.cash).toBe(1_000_000 - 10 * privateBuyPrice(n, "jets"));
    expect(buyMilitary(n, 5, { type: "spies", qty: 10 }).ok).toBe(false);
  });
});
