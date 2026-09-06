import { describe, it, expect } from "vitest";
import { resolveCombat, offensePower, defensePower, combatVarianceFor } from "./combat";
import { builtAcres } from "./economy";
import { config } from "./config";
import { makeNation, zeroMilitary } from "./factory";
import { rngFromSeed } from "./rng";
import type { Rng } from "./types";

const noSwing = (): Rng => () => 0.5; // swing multiplier of exactly 1.0

describe("power helpers (Earth Empires table)", () => {
  it("standard: troops 1/1, jets 2 off / 0 def, turrets 0 off / 2 def, tanks 4/4", () => {
    expect(offensePower(makeNation({ military: { jets: 10 }, government: "monarchy" }))).toBeCloseTo(10 * config.power.standard.off.jets);
    expect(defensePower(makeNation({ military: { jets: 10 }, government: "monarchy" }))).toBe(0);
    expect(offensePower(makeNation({ military: { turrets: 10 }, government: "monarchy" }))).toBe(0);
    expect(defensePower(makeNation({ military: { turrets: 10 }, government: "monarchy" }))).toBeCloseTo(10 * config.power.standard.def.turrets);
    expect(offensePower(makeNation({ military: { tanks: 10 }, government: "monarchy" }))).toBeCloseTo(10 * config.power.standard.off.tanks);
  });

  it("government military-strength modifier applies (Dictatorship > Republic)", () => {
    const dict = makeNation({ military: { tanks: 100 }, government: "dictatorship" });
    const rep = makeNation({ military: { tanks: 100 }, government: "republic" });
    expect(offensePower(dict)).toBeGreaterThan(offensePower(rep));
  });
});

describe("resolveCombat — standard / planned", () => {
  const bigAtk = () => makeNation({ id: "a", name: "A", military: { troops: 5000, tanks: 2000 }, oil: 5000, land: 1000 });
  const softDef = () => makeNation({ id: "d", name: "D", military: { troops: 40, turrets: 40 }, land: 1000, cash: 100_000, bushels: 40_000 });

  it("a won standard strike captures land, cash, bushels and buildings", () => {
    const def = makeNation({ ...softDef(), buildings: { enterpriseZones: 200, farms: 100 } });
    const { result, attacker, defender } = resolveCombat(bigAtk(), def, "standard", noSwing());
    expect(result.outcome).toBe("attacker_won");
    expect(result.landCaptured).toBeGreaterThan(0);
    expect(result.cashLooted).toBeGreaterThan(0);
    expect(result.bushelsLooted).toBeGreaterThan(0);
    expect(attacker.land).toBe(1000 + result.landCaptured);
    expect(defender.land).toBe(1000 - result.landCaptured);
    expect(builtAcres(defender)).toBeLessThan(300); // some buildings captured/removed
  });

  it("planned strike hits harder than standard for the same forces", () => {
    const std = resolveCombat(bigAtk(), softDef(), "standard", noSwing()).result;
    const pln = resolveCombat(bigAtk(), softDef(), "planned", noSwing()).result;
    expect(pln.attackerOffense).toBeGreaterThan(std.attackerOffense);
  });

  it("a repelled strike transfers nothing and costs the attacker units", () => {
    const weak = makeNation({ id: "a", name: "A", military: { troops: 5 }, oil: 500 });
    const wall = makeNation({ id: "d", name: "D", military: { troops: 500, turrets: 800 }, land: 1000, cash: 50_000 });
    const { result, attacker, defender } = resolveCombat(weak, wall, "standard", noSwing());
    expect(result.outcome).toBe("attacker_repelled");
    expect(result.landCaptured).toBe(0);
    expect(defender.cash).toBe(50_000);
    expect(attacker.military.troops).toBeLessThan(5 + 1);
  });

  it("oil cost is 1 barrel per 25 deployed units", () => {
    const atk = makeNation({ military: { troops: 500 }, oil: 5000 });
    const { result } = resolveCombat(atk, softDef(), "standard", noSwing());
    expect(result.oilSpent).toBe(Math.ceil(500 / config.unitsPerOilBarrel));
  });

  it("flips an AI defender to defeated past the land floor", () => {
    const def = makeNation({ id: "d", name: "D", archetype: "economic", land: 130, military: { troops: 200, turrets: 200 } });
    const { defender } = resolveCombat(bigAtk(), def, "standard", noSwing());
    expect(defender.land).toBeLessThan(config.defeatLandFloor);
    expect(defender.defeated).toBe(true);
  });

  it("the player is defeated by the same land/army floor as any AI nation", () => {
    const player = makeNation({ id: "player", isPlayer: true, land: 10, military: zeroMilitary() });
    const { defender } = resolveCombat(bigAtk(), player, "standard", noSwing());
    expect(defender.land).toBeLessThan(config.defeatLandFloor);
    expect(defender.defeated).toBe(true);
  });

  it("is deterministic for a given RNG state", () => {
    const mk = () => ({ a: makeNation({ id: "a", name: "A", military: { troops: 400, tanks: 200 }, oil: 5000 }), d: makeNation({ id: "d", name: "D", military: { troops: 300, turrets: 300 }, cash: 5000 }) });
    const r1 = rngFromSeed(42);
    const r2 = rngFromSeed(42);
    const x = mk();
    const y = mk();
    expect(resolveCombat(x.a, x.d, "standard", r1.next).result).toEqual(resolveCombat(y.a, y.d, "standard", r2.next).result);
  });
});

describe("resolveCombat — quantity selection", () => {
  const bigAtk = () => makeNation({ id: "a", name: "A", military: { troops: 5000, jets: 1000, tanks: 2000 }, oil: 50_000, land: 1000 });
  const softDef = () => makeNation({ id: "d", name: "D", military: { troops: 40, turrets: 40 }, land: 1000, cash: 100_000, bushels: 40_000 });

  it("sending fewer troops than you have leaves the rest untouched", () => {
    const atk = bigAtk();
    const { result, attacker } = resolveCombat(atk, softDef(), "standard", noSwing(), { troops: 1000, jets: 0, tanks: 0 });
    expect(result.sent).toEqual({ troops: 1000, jets: 0, tanks: 0 });
    // 5000 - 1000 sent = 4000 never left home, untouched by combat losses.
    expect(attacker.military.troops).toBeGreaterThanOrEqual(4000);
    expect(attacker.military.jets).toBe(1000); // none sent, none lost
    expect(attacker.military.tanks).toBe(2000);
  });

  it("oil cost is based on what's actually sent, not the whole army", () => {
    const atk = bigAtk();
    const { result } = resolveCombat(atk, softDef(), "standard", noSwing(), { troops: 250, jets: 0, tanks: 0 });
    expect(result.oilSpent).toBe(Math.ceil(250 / config.unitsPerOilBarrel));
  });

  it("requesting more than available is clamped, not an error", () => {
    const atk = makeNation({ military: { troops: 100 }, oil: 5000 });
    const { result } = resolveCombat(atk, softDef(), "standard", noSwing(), { troops: 10_000, jets: 0, tanks: 0 });
    expect(result.sent.troops).toBe(100);
  });

  it("omitting orders sends everything available, same as before quantity selection existed", () => {
    const atk = bigAtk();
    const { result } = resolveCombat(atk, softDef(), "standard", noSwing());
    expect(result.sent).toEqual({ troops: 5000, jets: 1000, tanks: 2000 });
  });

  it("orders for a unit type the attack doesn't use are ignored", () => {
    const atk = bigAtk();
    // Guerilla only ever sends troops — jets/tanks orders are meaningless here.
    const { result } = resolveCombat(atk, softDef(), "guerilla", noSwing(), { troops: 500, jets: 999, tanks: 999 });
    expect(result.sent).toEqual({ troops: 500, jets: 0, tanks: 0 });
  });
});

describe("resolveCombat — Planned Strike brigades", () => {
  const bigAtk = () => makeNation({ id: "a", name: "A", military: { troops: 5000, jets: 1000, tanks: 2000 }, oil: 50_000, land: 1000 });
  const softDef = () => makeNation({ id: "d", name: "D", military: { troops: 40, turrets: 40 }, land: 1000, cash: 100_000, bushels: 40_000 });

  it("a won planned strike puts survivors of the sent force into a new brigade", () => {
    const { result, attacker } = resolveCombat(bigAtk(), softDef(), "planned", noSwing(), { troops: 1000, jets: 0, tanks: 0 });
    expect(attacker.brigades).toHaveLength(1);
    const b = attacker.brigades[0]!;
    expect(b.turnsLeft).toBe(config.plannedStrikeRestTurns);
    expect(b.troops).toBeGreaterThan(0);
    expect(b.troops).toBeLessThanOrEqual(1000); // survivors of the 1000 sent, not the whole army
    expect(result.restingTurns).toBe(config.plannedStrikeRestTurns);
  });

  it("a repelled planned strike still rests whatever survived", () => {
    const weak = makeNation({ id: "a", name: "A", military: { troops: 100 }, oil: 5000 });
    const wall = makeNation({ id: "d", name: "D", military: { troops: 2000, turrets: 3000 }, land: 1000 });
    const { result, attacker } = resolveCombat(weak, wall, "planned", noSwing());
    expect(result.outcome).toBe("attacker_repelled");
    expect(attacker.brigades.length).toBeLessThanOrEqual(1); // 0 only if every unit died
    if (attacker.brigades.length === 1) expect(attacker.brigades[0]!.turnsLeft).toBe(config.plannedStrikeRestTurns);
  });

  it("resting brigade units are excluded from both future offense and defense", () => {
    const atk = bigAtk();
    const { attacker } = resolveCombat(atk, softDef(), "planned", noSwing(), { troops: 5000, jets: 1000, tanks: 2000 });
    // Everything was sent and is now resting (minus any losses) — offense and
    // defense should both read close to 0, not the nation's full stats.
    expect(offensePower(attacker, "standard")).toBeLessThan(offensePower(atk, "standard") * 0.2);
    expect(defensePower(attacker, "standard")).toBeLessThan(defensePower(bigAtk(), "standard") + 1);
  });

  it("non-planned attack types never create a brigade — forces return immediately", () => {
    const atk = bigAtk();
    const { attacker } = resolveCombat(atk, softDef(), "standard", noSwing(), { troops: 1000, jets: 0, tanks: 0 });
    expect(attacker.brigades).toHaveLength(0);
    expect(offensePower(attacker, "standard")).toBeGreaterThan(0); // untouched troops/jets/tanks still available
  });

  it("a defender's own resting brigade doesn't help it defend", () => {
    const defenderWithBrigade = makeNation({
      id: "d",
      military: { troops: 5000, turrets: 40 },
      brigades: [{ troops: 5000, jets: 0, tanks: 0, turnsLeft: 50 }],
      land: 1000,
    });
    const defenderWithoutBrigade = makeNation({ id: "d", military: { troops: 5000, turrets: 40 }, land: 1000 });
    // Troops contribute to standard defense; with them all resting, defense
    // should be far weaker than the identical nation with nothing resting.
    expect(defensePower(defenderWithBrigade, "standard")).toBeLessThan(defensePower(defenderWithoutBrigade, "standard"));
  });
});

describe("combat variance scales with mismatch", () => {
  it("an even fight gets exactly the base variance", () => {
    expect(combatVarianceFor(1000, 1000)).toBeCloseTo(config.combatVariance, 5);
  });

  it("widens as the two sides pull apart, symmetrically", () => {
    const v15 = combatVarianceFor(1500, 1000);
    const v20 = combatVarianceFor(2000, 1000);
    expect(v15).toBeGreaterThan(config.combatVariance);
    expect(v20).toBeGreaterThan(v15);
    // Direction doesn't matter — a 2:1 underdog widens defense's swing the
    // same amount as a 2:1 favorite widens the attacker's.
    expect(combatVarianceFor(1000, 2000)).toBeCloseTo(v20, 10);
  });

  it("is capped at combatVarianceMax no matter how extreme the mismatch", () => {
    expect(combatVarianceFor(1_000_000, 1)).toBe(config.combatVarianceMax);
    expect(combatVarianceFor(5, 0)).toBe(config.combatVarianceMax);
    expect(combatVarianceFor(0, 0)).toBeLessThanOrEqual(config.combatVarianceMax); // degenerate, just shouldn't throw/NaN
  });

  it("a real (if slim) underdog chance now exists at a 2:1 mismatch — statistically", () => {
    const attacker = () => makeNation({ id: "a", military: { troops: 2000 }, oil: 50_000 });
    const defender = () => makeNation({ id: "d", military: { troops: 1000 }, land: 500 });
    const rng = rngFromSeed(7);
    let underdogWins = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      const { result } = resolveCombat(attacker(), defender(), "guerilla", rng.next);
      if (result.outcome === "attacker_repelled") underdogWins++;
    }
    const rate = underdogWins / trials;
    // Should be a real, noticeable chance (not ~0 like the old flat variance
    // made it), but still clearly the minority outcome.
    expect(rate).toBeGreaterThan(0.03);
    expect(rate).toBeLessThan(0.3);
  });

  it("a huge mismatch still overwhelmingly favors the stronger side", () => {
    const attacker = () => makeNation({ id: "a", military: { troops: 10_000 }, oil: 50_000 });
    const defender = () => makeNation({ id: "d", military: { troops: 500 }, land: 500 });
    const rng = rngFromSeed(11);
    let attackerWins = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      const { result } = resolveCombat(attacker(), defender(), "guerilla", rng.next);
      if (result.outcome === "attacker_won") attackerWins++;
    }
    expect(attackerWins / trials).toBeGreaterThan(0.9);
  });
});

describe("resolveCombat — guerilla / bombing / artillery", () => {
  it("guerilla: troops only vs troops; kills population, no land", () => {
    const atk = makeNation({ military: { troops: 20_000 }, oil: 5000 });
    const def = makeNation({ military: { troops: 30, turrets: 10_000 }, land: 1000, population: 50_000 });
    const { result, defender } = resolveCombat(atk, def, "guerilla", noSwing());
    expect(result.outcome).toBe("attacker_won"); // turrets don't defend guerilla
    expect(result.landCaptured).toBe(0);
    expect(result.populationKilled).toBeGreaterThan(0);
    expect(defender.population).toBeLessThan(50_000);
  });

  it("bombing: jets vs turrets; razes buildings, no land", () => {
    const atk = makeNation({ military: { jets: 20_000 }, oil: 5000 });
    const def = makeNation({ military: { troops: 10_000, turrets: 30 }, buildings: { enterpriseZones: 400, industrialComplexes: 300 }, land: 4000 });
    const { result, defender } = resolveCombat(atk, def, "bombing", noSwing());
    expect(result.outcome).toBe("attacker_won"); // troops don't defend bombing
    expect(result.buildingsRazed).toBeGreaterThan(0);
    expect(result.landCaptured).toBe(0);
    expect(defender.land).toBe(4000);
    expect(builtAcres(defender)).toBeLessThan(700);
  });

  it("artillery: tanks vs tanks; razes buildings", () => {
    const atk = makeNation({ military: { tanks: 10_000 }, oil: 5000 });
    const def = makeNation({ military: { troops: 50_000, tanks: 20 }, buildings: { farms: 500 }, land: 2000 });
    const { result } = resolveCombat(atk, def, "artillery", noSwing());
    expect(result.outcome).toBe("attacker_won");
    expect(result.buildingsRazed).toBeGreaterThan(0);
    expect(result.landCaptured).toBe(0);
  });
});
