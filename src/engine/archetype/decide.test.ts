import { describe, it, expect } from "vitest";
import { decideAction, effectiveWeights } from "./decide";
import { ARCHETYPES, type ArchetypeAction } from "./templates";
import { rngFromSeed } from "../rng";

describe("decideAction", () => {
  it("empirical frequencies track the weights over many seeded rolls", () => {
    const template = ARCHETYPES.balanced; // attack 2 / covert 1 / buildMilitary 6 / buildEconomy 3 / explore 3
    const rng = rngFromSeed(2024);
    const counts: Record<ArchetypeAction, number> = {
      attackPlayer: 0,
      covertPlayer: 0,
      buildMilitary: 0,
      buildEconomy: 0,
      explore: 0,
    };
    const N = 20000;
    for (let i = 0; i < N; i++) counts[decideAction(template, 1, rng.next)]++;

    const w = effectiveWeights(template, 1);
    const totalW = w.attackPlayer + w.covertPlayer + w.buildMilitary + w.buildEconomy + w.explore;
    for (const a of Object.keys(counts) as ArchetypeAction[]) {
      expect(counts[a] / N).toBeCloseTo(w[a] / totalW, 1);
    }
  });

  it("never picks a zero-weight action", () => {
    // Economic still runs the shared table (no action naturally disabled) —
    // zero one out explicitly here.
    const template = { ...ARCHETYPES.economic, decisionTable: { ...ARCHETYPES.economic.decisionTable, attackPlayer: 0 } };
    const rng = rngFromSeed(7);
    for (let i = 0; i < 5000; i++) {
      expect(decideAction(template, 1, rng.next)).not.toBe("attackPlayer");
    }
  });

  it("aggression skew raises the attackPlayer share", () => {
    const template = ARCHETYPES.raider;
    const low = rngFromSeed(11);
    const high = rngFromSeed(11);
    let lowAttacks = 0;
    let highAttacks = 0;
    for (let i = 0; i < 8000; i++) {
      if (decideAction(template, 0.5, low.next) === "attackPlayer") lowAttacks++;
      if (decideAction(template, 2.0, high.next) === "attackPlayer") highAttacks++;
    }
    expect(highAttacks).toBeGreaterThan(lowAttacks);
  });

  it("degenerate all-zero table falls back to buildEconomy", () => {
    const dead = {
      ...ARCHETYPES.turtle,
      decisionTable: { attackPlayer: 0, covertPlayer: 0, buildMilitary: 0, buildEconomy: 0, explore: 0 },
    };
    const rng = rngFromSeed(1);
    expect(decideAction(dead, 1, rng.next)).toBe("buildEconomy");
  });
});
