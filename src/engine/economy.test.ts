import { describe, it, expect } from "vitest";
import {
  applyEconomyTick,
  builtAcres,
  emptyAcres,
  militaryUpkeep,
  perCapitaIncome,
  popCapacity,
  projectRates,
  spal,
  totalMilitary,
} from "./economy";
import { config } from "./config";
import { makeNation } from "./factory";

describe("economy basics", () => {
  it("splits land into built and empty acres across the 8 building types", () => {
    const n = makeNation({ land: 1000, buildings: { enterpriseZones: 200, industrialComplexes: 100, farms: 50 } });
    expect(builtAcres(n)).toBe(350);
    expect(emptyAcres(n)).toBe(650);
  });

  it("totalMilitary sums all five unit types; spal is spies ÷ land", () => {
    expect(totalMilitary({ troops: 1, jets: 2, turrets: 3, tanks: 4, spies: 5 })).toBe(15);
    expect(spal(makeNation({ land: 1000, military: { spies: 500 } }))).toBe(0.5);
  });
});

describe("per-capita income & revenue", () => {
  it("PCI rises with Enterprise-Zone density and falls with a punishing tax rate", () => {
    const bare = makeNation({ land: 1000, buildings: { enterpriseZones: 0 }, taxRate: 0.2 });
    const dense = makeNation({ land: 1000, buildings: { enterpriseZones: 300 }, taxRate: 0.2 });
    const overtaxed = makeNation({ land: 1000, buildings: { enterpriseZones: 300 }, taxRate: 0.65 });
    expect(perCapitaIncome(dense)).toBeGreaterThan(perCapitaIncome(bare));
    expect(perCapitaIncome(overtaxed)).toBeLessThan(perCapitaIncome(dense));
  });

  it("a higher seeded tax comfort threshold shifts the PCI penalty out — same rate, less drag", () => {
    const n = makeNation({ land: 1000, buildings: { enterpriseZones: 300 }, taxRate: 0.5 });
    expect(perCapitaIncome(n, 0.35)).toBeGreaterThan(perCapitaIncome(n, 0.1));
  });

  it("cash income now has a real peak below the tax cap, not a climb all the way to it", () => {
    // With the raised taxPciSlope, going all the way to taxRateMax should
    // cost real cash relative to stopping at the (threshold-shifted) sweet
    // spot — not be (nearly) the best number on the whole curve.
    const threshold = 0.18;
    const base = makeNation({ population: 10_000, buildings: { enterpriseZones: 300 } });
    const peakish = projectRates({ ...base, taxRate: 0.47 }, 1, config.pacingBaselineSeasonDays, threshold).grossCash;
    const maxed = projectRates({ ...base, taxRate: config.taxRateMax }, 1, config.pacingBaselineSeasonDays, threshold).grossCash;
    expect(maxed).toBeLessThan(peakish * 0.85); // meaningfully worse, not a rounding difference
  });

  it("gross revenue = population × PCI × tax; zero tax = zero revenue", () => {
    const n = makeNation({ population: 10_000, taxRate: 0.3, buildings: { enterpriseZones: 100 } });
    expect(projectRates(n).grossCash).toBeCloseTo(10_000 * perCapitaIncome(n) * 0.3, 3);
    expect(projectRates({ ...n, taxRate: 0 }).grossCash).toBe(0);
  });

  it("a Cash turn multiplies that tick's revenue", () => {
    const n = makeNation({ population: 10_000, taxRate: 0.3, buildings: { enterpriseZones: 100 } });
    expect(projectRates(n, config.cashTurnBonus).grossCash).toBeCloseTo(projectRates(n).grossCash * config.cashTurnBonus, 3);
  });
});

describe("military upkeep", () => {
  it("scales with army size and is cut by Military Bases + Military tech + government", () => {
    const plain = makeNation({ land: 1000, military: { troops: 1000, tanks: 500 } });
    const based = makeNation({ land: 1000, buildings: { militaryBases: 200 }, military: { troops: 1000, tanks: 500 } });
    const teched = makeNation({ land: 1000, tech: { military: 6000 }, military: { troops: 1000, tanks: 500 } });
    const theo = makeNation({ land: 1000, government: "theocracy", military: { troops: 1000, tanks: 500 } });
    expect(militaryUpkeep(plain)).toBeGreaterThan(0);
    expect(militaryUpkeep(based)).toBeLessThan(militaryUpkeep(plain));
    expect(militaryUpkeep(teched)).toBeLessThan(militaryUpkeep(plain));
    expect(militaryUpkeep(theo)).toBeLessThan(militaryUpkeep(plain));
  });

  it("a huge unpaid army drives net cash negative", () => {
    const n = makeNation({ population: 2000, taxRate: 0.2, buildings: { enterpriseZones: 20 }, military: { tanks: 100_000 } });
    expect(projectRates(n).cash).toBeLessThan(0);
  });
});

describe("applyEconomyTick", () => {
  const healthy = () =>
    makeNation({
      population: 12_000,
      cash: 100_000,
      bushels: 10_000,
      oil: 2000,
      taxRate: 0.25,
      buildings: { enterpriseZones: 120, residences: 100, industrialComplexes: 40, militaryBases: 15, researchLabs: 25, farms: 100, oilRigs: 25 },
      military: { troops: 300, turrets: 300 },
      production: { troops: 40, jets: 20, turrets: 20, tanks: 10, spies: 10 },
    });

  it("earns revenue, produces units per the mix, and accrues research to the focus", () => {
    const n = { ...healthy(), researchFocus: "weapons" as const };
    const { nation } = applyEconomyTick(n, 1, () => 0.9);
    expect(nation.cash).toBeGreaterThan(n.cash);
    expect(totalMilitary(nation.military)).toBeGreaterThan(totalMilitary(n.military));
    expect(nation.tech.weapons).toBeGreaterThan(0);
    expect(nation.tech.business).toBe(0);
  });

  it("the production mix decides which units the factories turn out", () => {
    const n = makeNation({ population: 100_000, buildings: { industrialComplexes: 200 }, production: { troops: 0, jets: 100, turrets: 0, tanks: 0, spies: 0 } });
    const { nation } = applyEconomyTick(n, 1, () => 0.9);
    expect(nation.military.jets).toBeGreaterThan(0);
    expect(nation.military.troops).toBe(0);
  });

  it("triggers starvation when bushels run out", () => {
    const n = makeNation({ population: 5_000_000, bushels: 5, buildings: { farms: 1 }, military: { troops: 5000 } });
    const { nation, log } = applyEconomyTick(n);
    expect(nation.bushels).toBe(0);
    expect(nation.population).toBeLessThan(n.population);
    expect(nation.military.troops).toBeLessThan(5000);
    expect(log.join(" ")).toMatch(/starvation/i);
  });

  it("triggers a treasury crisis when upkeep outruns revenue and the treasury empties", () => {
    const n = makeNation({ population: 1000, cash: 100, taxRate: 0.1, buildings: { enterpriseZones: 5, farms: 500 }, military: { tanks: 200_000 } });
    const { nation, log } = applyEconomyTick(n);
    expect(nation.cash).toBe(0);
    expect(log.join(" ")).toMatch(/treasury/i);
  });

  it("grows population toward its housing capacity when fed and lightly taxed", () => {
    const n = makeNation({ population: 2000, bushels: 500_000, taxRate: 0.1, buildings: { residences: 300, farms: 300, enterpriseZones: 20 } });
    expect(applyEconomyTick(n).nation.population).toBeGreaterThan(n.population);
    expect(popCapacity(n)).toBeGreaterThan(n.population);
  });
});
