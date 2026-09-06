import { describe, it, expect } from "vitest";
import { resolveCovertOp, covertSuccessChance, snapshotIntel, isHarmful } from "./covert";
import { config } from "./config";
import { makeNation } from "./factory";
import { rngFromSeed } from "./rng";
import type { Rng } from "./types";

const always = (v: number): Rng => () => v;

describe("covertSuccessChance (SPAL-based)", () => {
  it("rises with attacker spies-per-acre, falls with defender counter-intel", () => {
    const weak = makeNation({ land: 1000, military: { spies: 20 } });
    const strong = makeNation({ land: 1000, military: { spies: 5000 } });
    const softTarget = makeNation({ land: 1000, military: { spies: 0 } });
    const hardTarget = makeNation({ land: 1000, military: { spies: 8000 } });

    expect(covertSuccessChance(strong, softTarget, "spy")).toBeGreaterThan(covertSuccessChance(weak, softTarget, "spy"));
    expect(covertSuccessChance(strong, hardTarget, "spy")).toBeLessThan(covertSuccessChance(strong, softTarget, "spy"));
  });

  it("harmful-op heat cuts success; the `spy` report is immune", () => {
    const a = makeNation({ land: 1000, military: { spies: 3000 } });
    const d = makeNation({ land: 1000, military: { spies: 200 } });
    expect(covertSuccessChance(a, d, "bombBuildings", 0.5)).toBeLessThan(covertSuccessChance(a, d, "bombBuildings", 0));
    expect(covertSuccessChance(a, d, "spy", 0.5)).toBe(covertSuccessChance(a, d, "spy", 0));
  });

  it("stays clamped to [minSuccess, maxSuccess]", () => {
    const godSpy = makeNation({ land: 100, military: { spies: 10 ** 7 } });
    const noSpy = makeNation({ land: 10 ** 6, military: { spies: 0 } });
    expect(covertSuccessChance(godSpy, noSpy, "spy")).toBeLessThanOrEqual(config.covert.maxSuccess);
    expect(covertSuccessChance(noSpy, godSpy, "espionage")).toBeGreaterThanOrEqual(config.covert.minSuccess);
  });
});

describe("resolveCovertOp", () => {
  const spies = () => makeNation({ id: "a", name: "A", land: 1000, cash: 0, bushels: 0, military: { spies: 8000 } });
  const target = () =>
    makeNation({
      id: "d",
      name: "D",
      land: 1000,
      military: { spies: 10, troops: 5000 },
      buildings: { enterpriseZones: 400, industrialComplexes: 400 },
      bushels: 100_000,
      tech: { weapons: 5000, spy: 1000 },
    });

  it("spy success returns a full intel snapshot with the day stamp", () => {
    const { result } = resolveCovertOp(spies(), target(), "spy", 7, always(0));
    expect(result.success).toBe(true);
    expect(result.intel?.day).toBe(7);
    expect(result.intel?.military.troops).toBe(5000);
  });

  it("espionage steals tech points into the attacker's Military Strategy", () => {
    const { result, attacker, defender } = resolveCovertOp(spies(), target(), "espionage", 1, always(0));
    expect(result.techStolen).toBeGreaterThan(0);
    expect(defender.tech.weapons).toBeLessThan(5000);
    expect(attacker.tech.militaryStrategy).toBe(result.techStolen);
  });

  it("bombBuildings wrecks acres; raidFoodStores seizes bushels", () => {
    expect(resolveCovertOp(spies(), target(), "bombBuildings", 1, always(0)).result.buildingsSabotaged).toBeGreaterThan(0);
    const raid = resolveCovertOp(spies(), target(), "raidFoodStores", 1, always(0));
    expect(raid.result.bushelsRaided).toBeGreaterThan(0);
    expect(raid.attacker.bushels).toBe(raid.result.bushelsRaided);
    expect(raid.defender.bushels).toBeLessThan(100_000);
  });

  it("sabotageIntelligence kills spies; causeDissensions makes troops desert", () => {
    expect(resolveCovertOp(spies(), target(), "sabotageIntelligence", 1, always(0)).result.spiesSabotaged).toBeGreaterThan(0);
    expect(resolveCovertOp(spies(), target(), "causeDissensions", 1, always(0)).result.troopsDeserted).toBeGreaterThan(0);
  });

  it("failure costs the attacker a bigger chunk of spies and yields nothing", () => {
    const { result, attacker } = resolveCovertOp(spies(), target(), "espionage", 1, always(0.999));
    expect(result.success).toBe(false);
    expect(result.spiesLost).toBeGreaterThan(0);
    expect(attacker.military.spies).toBe(8000 - result.spiesLost);
    expect(result.techStolen).toBe(0);
  });

  it("the second RNG value drives the detection flag", () => {
    const seq = [0.999, 0.01]; // fail, then detected
    let i = 0;
    const rng: Rng = () => seq[i++ % seq.length]!;
    expect(resolveCovertOp(spies(), target(), "bombBuildings", 1, rng).result.detected).toBe(true);
  });

  it("is deterministic for a given RNG state", () => {
    const r1 = rngFromSeed(99);
    const r2 = rngFromSeed(99);
    expect(resolveCovertOp(spies(), target(), "bombBuildings", 3, r1.next).result).toEqual(
      resolveCovertOp(spies(), target(), "bombBuildings", 3, r2.next).result,
    );
  });

  it("isHarmful marks the report op as safe and the rest as harmful", () => {
    expect(isHarmful("spy")).toBe(false);
    expect(isHarmful("bombBuildings")).toBe(true);
  });

  it("snapshotIntel captures the nation as-is", () => {
    const n = makeNation({ land: 1234, bushels: 999, military: { jets: 77 }, missiles: { nuclear: 3 } });
    const snap = snapshotIntel(n, 12);
    expect(snap.land).toBe(1234);
    expect(snap.bushels).toBe(999);
    expect(snap.military.jets).toBe(77);
    expect(snap.missiles.nuclear).toBe(3);
  });
});
