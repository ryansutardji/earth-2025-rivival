import { describe, it, expect } from "vitest";
import { decideAction } from "./decide";
import { ARCHETYPES, ARCHETYPE_ACTIONS, type ArchetypeAction } from "./templates";
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
    for (let i = 0; i < N; i++) counts[decideAction(template, rng.next)]++;

    const w = template.decisionTable;
    const totalW = ARCHETYPE_ACTIONS.reduce((s, a) => s + w[a], 0);
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
      expect(decideAction(template, rng.next)).not.toBe("attackPlayer");
    }
  });

  it("a heavier attackPlayer weight raises the attackPlayer share", () => {
    // Season-heat scaling is applied to the weights by the caller before this
    // runs, so it reduces to "bigger weight => picked more often".
    const template = ARCHETYPES.balanced;
    const light = { ...template, decisionTable: { ...template.decisionTable, attackPlayer: 1 } };
    const heavy = { ...template, decisionTable: { ...template.decisionTable, attackPlayer: 12 } };
    const lo = rngFromSeed(11);
    const hi = rngFromSeed(11);
    let loAttacks = 0;
    let hiAttacks = 0;
    for (let i = 0; i < 8000; i++) {
      if (decideAction(light, lo.next) === "attackPlayer") loAttacks++;
      if (decideAction(heavy, hi.next) === "attackPlayer") hiAttacks++;
    }
    expect(hiAttacks).toBeGreaterThan(loAttacks);
  });

  it("degenerate all-zero table falls back to buildEconomy", () => {
    const dead = {
      ...ARCHETYPES.turtle,
      decisionTable: { attackPlayer: 0, covertPlayer: 0, buildMilitary: 0, buildEconomy: 0, explore: 0 },
    };
    const rng = rngFromSeed(1);
    expect(decideAction(dead, rng.next)).toBe("buildEconomy");
  });
});
