import { describe, it, expect } from "vitest";
import { generateSeason } from "./season";
import { getTier } from "../data/difficultyTiers";
import type { SeasonConfig } from "./types";

const baseCfg: SeasonConfig = {
  tierId: "veteran",
  rosterSize: 6,
  eligibleArchetypes: ["raider", "economic"],
  seasonLengthDays: 30,
  playerGovernment: "republic",
  seed: 4242,
};

describe("generateSeason", () => {
  it("honours the requested roster size", () => {
    for (const size of [1, 2, 5, 12]) {
      const roster = generateSeason({ ...baseCfg, rosterSize: size }, getTier("veteran"));
      expect(roster).toHaveLength(size);
    }
  });

  it("only spawns eligible archetypes", () => {
    const roster = generateSeason(baseCfg, getTier("veteran"));
    for (const n of roster) {
      expect(baseCfg.eligibleArchetypes).toContain(n.archetype);
    }
  });

  it("round-robins archetypes so small rosters get a mix", () => {
    const roster = generateSeason({ ...baseCfg, rosterSize: 4 }, getTier("veteran"));
    const kinds = new Set(roster.map((n) => n.archetype));
    expect(kinds).toEqual(new Set(["raider", "economic"]));
  });

  it("is fully deterministic for a given seed", () => {
    const a = generateSeason(baseCfg, getTier("veteran"));
    const b = generateSeason(baseCfg, getTier("veteran"));
    expect(a).toEqual(b);
  });

  it("changes with the seed", () => {
    const a = generateSeason(baseCfg, getTier("veteran"));
    const b = generateSeason({ ...baseCfg, seed: 999 }, getTier("veteran"));
    expect(a.map((n) => n.name)).not.toEqual(b.map((n) => n.name));
  });

  it("scales baselines by the tier multiplier", () => {
    const easy = generateSeason({ ...baseCfg, rosterSize: 2 }, getTier("recruit"));
    const hard = generateSeason({ ...baseCfg, rosterSize: 2 }, getTier("warlord"));
    expect(hard[0]!.land).toBeGreaterThan(easy[0]!.land);
    expect(hard[0]!.military.troops).toBeGreaterThan(easy[0]!.military.troops);
  });

  it("gives every enemy a distinct name and id", () => {
    const roster = generateSeason({ ...baseCfg, rosterSize: 12 }, getTier("veteran"));
    expect(new Set(roster.map((n) => n.name)).size).toBe(12);
    expect(new Set(roster.map((n) => n.id)).size).toBe(12);
  });
});
