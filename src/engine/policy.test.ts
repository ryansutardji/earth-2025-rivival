import { describe, it, expect } from "vitest";
import { setGovernment, setTaxRate, setProduction, setResearchFocus } from "./policy";
import { config } from "./config";
import { makeNation } from "./factory";
import { builtAcres } from "./economy";
import { TECH_CATEGORIES } from "./types";

describe("setGovernment — instability penalty", () => {
  const richNation = () =>
    makeNation({
      government: "tyranny",
      cash: 100_000,
      military: { troops: 1000, jets: 500, turrets: 500, tanks: 200, spies: 50 },
      buildings: { enterpriseZones: 100, residences: 100, industrialComplexes: 50, militaryBases: 20, researchLabs: 20, farms: 50, oilRigs: 20, constructionSites: 10 },
      tech: TECH_CATEGORIES.reduce((t, c) => ({ ...t, [c]: 200 }), {} as Record<(typeof TECH_CATEGORIES)[number], number>),
    });

  it("leaving Monarchy is completely free", () => {
    const n = makeNation({ government: "monarchy", cash: 50_000, military: { troops: 1000 } });
    const r = setGovernment(n, 10, "tyranny");
    expect(r.ok).toBe(true);
    expect(r.nation.government).toBe("tyranny");
    expect(r.nation.cash).toBe(50_000);
    expect(r.nation.military.troops).toBe(1000);
  });

  it("leaving any other government costs cash, military, tech, and buildings", () => {
    const n = richNation();
    const before = { cash: n.cash, troops: n.military.troops, tech: n.tech.weapons, acres: builtAcres(n) };
    const r = setGovernment(n, 10, "democracy");
    expect(r.ok).toBe(true);
    const p = config.governmentChangePenaltyPct;
    expect(r.nation.cash).toBe(Math.max(0, before.cash - Math.round(before.cash * p.cash)));
    expect(r.nation.military.troops).toBe(Math.floor(before.troops * (1 - p.military)));
    expect(r.nation.tech.weapons).toBeCloseTo(before.tech * (1 - p.tech), 0);
    expect(builtAcres(r.nation)).toBeLessThan(before.acres);
  });

  it("switching back to Monarchy still costs the penalty — Monarchy is only free to leave, not to return to", () => {
    const n = richNation(); // currently tyranny
    const r = setGovernment(n, 10, "monarchy");
    expect(r.ok).toBe(true);
    expect(r.nation.government).toBe("monarchy");
    expect(r.nation.cash).toBeLessThan(n.cash);
  });

  it("spies are untouched by the military penalty", () => {
    const n = richNation();
    const r = setGovernment(n, 10, "democracy");
    expect(r.nation.military.spies).toBe(n.military.spies);
  });

  it("still rejects switching to the same government, and insufficient turns, same as before", () => {
    const n = richNation();
    expect(setGovernment(n, 10, "tyranny").ok).toBe(false);
    expect(setGovernment(n, config.turnCost.setGovernment - 1, "democracy").ok).toBe(false);
  });

  it("costs turnCost.setGovernment turns either way", () => {
    const free = setGovernment(makeNation({ government: "monarchy" }), 10, "tyranny");
    const penalized = setGovernment(makeNation({ government: "tyranny" }), 10, "democracy");
    expect(free.turnsRemaining).toBe(10 - config.turnCost.setGovernment);
    expect(penalized.turnsRemaining).toBe(10 - config.turnCost.setGovernment);
  });
});

describe("other policy actions (unchanged)", () => {
  it("setTaxRate clamps and rejects a no-op change", () => {
    const n = makeNation({ taxRate: 0.25 });
    expect(setTaxRate(n, 10, 0.9).nation.taxRate).toBeLessThanOrEqual(config.taxRateMax);
    expect(setTaxRate(n, 10, 0.25).ok).toBe(false);
  });

  it("setProduction normalises to 100 and rejects an all-zero mix", () => {
    const n = makeNation();
    const r = setProduction(n, 10, { troops: 50, jets: 50, turrets: 0, tanks: 0, spies: 0 });
    expect(r.ok).toBe(true);
    expect(r.nation.production.troops + r.nation.production.jets).toBeCloseTo(100, 0);
    expect(setProduction(n, 10, { troops: 0, jets: 0, turrets: 0, tanks: 0, spies: 0 }).ok).toBe(false);
  });

  it("setResearchFocus rejects a no-op change", () => {
    const n = makeNation({ researchFocus: "business" });
    expect(setResearchFocus(n, 10, "business").ok).toBe(false);
    expect(setResearchFocus(n, 10, "weapons").ok).toBe(true);
  });
});
