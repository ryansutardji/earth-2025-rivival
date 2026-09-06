import { describe, it, expect } from "vitest";
import { netWorth, computeStandings } from "./networth";
import { config } from "./config";
import { makeNation } from "./factory";
import { createWorld } from "./world";
import type { SeasonConfig } from "./types";

const cfg: SeasonConfig = {
  tierId: "veteran",
  rosterSize: 3,
  eligibleArchetypes: ["raider", "economic"],
  seasonLengthDays: 30,
  playerGovernment: "monarchy",
  seed: 999,
};

describe("netWorth", () => {
  it("is a weighted sum of land, buildings, cash, population, bushels, oil, tech, units, missiles", () => {
    const n = makeNation({
      land: 1000,
      buildings: { enterpriseZones: 100, farms: 50 },
      cash: 100_000,
      population: 4000,
      bushels: 3000,
      oil: 1000,
      tech: { weapons: 500, spy: 300 },
      military: { troops: 100, jets: 50, turrets: 50, tanks: 10, spies: 20 },
      missiles: { chemical: 2, cruise: 1, nuclear: 1 },
    });
    const w = config.netWorthWeights;
    const expected =
      1000 * w.land +
      150 * w.building +
      100_000 * w.cashPerDollar +
      4000 * w.population +
      3000 * w.bushelsPerUnit +
      1000 * w.oilPerUnit +
      800 * w.techPerPoint +
      100 * w.troops +
      50 * w.jets +
      50 * w.turrets +
      10 * w.tanks +
      20 * w.spies +
      4 * w.missile;
    expect(netWorth(n)).toBe(Math.round(expected));
  });

  it("rises when any component grows", () => {
    const base = makeNation({ land: 500, cash: 0, population: 0, bushels: 0, oil: 0 });
    expect(netWorth(makeNation({ ...base, land: 900 }))).toBeGreaterThan(netWorth(base));
    expect(netWorth(makeNation({ ...base, population: 5000 }))).toBeGreaterThan(netWorth(base));
    expect(netWorth(makeNation({ ...base, missiles: { chemical: 10, cruise: 0, nuclear: 0 } }))).toBeGreaterThan(netWorth(base));
  });
});

describe("computeStandings", () => {
  it("ranks by net worth, defeated last at 0, exactly one player row", () => {
    const world = createWorld(cfg);
    const s0 = computeStandings(world);
    expect(s0).toHaveLength(1 + cfg.rosterSize);
    for (let i = 1; i < s0.length; i++) expect(s0[i - 1]!.netWorth).toBeGreaterThanOrEqual(s0[i]!.netWorth);
    expect(s0.filter((r) => r.isPlayer)).toHaveLength(1);

    world.enemies[0]!.defeated = true;
    const s1 = computeStandings(world);
    expect(s1[s1.length - 1]!.id).toBe(world.enemies[0]!.id);
    expect(s1[s1.length - 1]!.netWorth).toBe(0);
  });
});
