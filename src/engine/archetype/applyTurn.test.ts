import { describe, it, expect } from "vitest";
import { applyArchetypeTurn, type RosterTurnInput } from "./applyTurn";
import { ARCHETYPES } from "./templates";
import { makeNation, type NationOverrides } from "../factory";
import { builtAcres, projectRates, totalMilitary } from "../economy";
import { config } from "../config";
import { attacksUnlockDay } from "../pacing";
import { decayDaily } from "../grudges";
import { rngFromSeed } from "../rng";
import type { DifficultyTier, Nation } from "../types";

const tier: DifficultyTier = {
  id: "test",
  label: "Test",
  growthMultiplier: 1,
  baselineMult: 1,
  aggressionSkew: 1,
};
const SEASON_DAYS = 30;
const TAX = config.taxComfortThresholdDefault;

function seedNation(archetype: keyof typeof ARCHETYPES, overrides: NationOverrides = {}): Nation {
  const b = ARCHETYPES[archetype].baseline;
  return makeNation({
    id: archetype,
    name: archetype,
    archetype,
    land: b.land,
    cash: b.cash,
    buildings: { ...b.buildings },
    military: { ...b.military },
    ...overrides,
  });
}

/** Refill every living archetype's turn budget — the "new day" transition
 * `turn.ts` performs at End Day, isolated here so tests can drive many days
 * without going through the full player-turn handler. */
function newDay(input: RosterTurnInput): RosterTurnInput {
  return { ...input, enemies: input.enemies.map((e) => (e.defeated ? e : { ...e, aiTurnsRemaining: config.turnPoolCap })) };
}

describe("applyArchetypeTurn", () => {
  it("mandatory first action: adopts its real target government from Monarchy for free", () => {
    const self = seedNation("balanced");
    expect(self.government).toBe("monarchy");
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(1).next;

    const res = applyArchetypeTurn(self.id, { player, enemies: [self] }, tier, 1, SEASON_DAYS, TAX, rng);
    const next = res.enemies[0]!;
    expect(next.government).toBe(ARCHETYPES.balanced.government);
    // Free: leaving Monarchy never costs anything — no instability razing.
    expect(builtAcres(next)).toBe(builtAcres(self));
  });

  it("mandatory second action: sets its own tax rate to the season's real sweet spot, one call after adopting its government", () => {
    const self = seedNation("balanced");
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(1).next;
    let input: RosterTurnInput = { player, enemies: [self] };

    // Call 1: government (still Monarchy) — tax rate must NOT change yet,
    // a player can't bundle two actions into one turn and neither should this.
    let res = applyArchetypeTurn(self.id, input, tier, 1, SEASON_DAYS, TAX, rng);
    input = { player: res.player, enemies: res.enemies };
    expect(input.enemies[0]!.government).toBe(ARCHETYPES.balanced.government);
    expect(input.enemies[0]!.taxRate).toBe(self.taxRate);

    // Call 2: government's already correct, so this call fixes tax rate.
    res = applyArchetypeTurn(self.id, input, tier, 1, SEASON_DAYS, TAX, rng);
    input = { player: res.player, enemies: res.enemies };
    expect(input.enemies[0]!.taxRate).toBe(TAX);

    // Call 3: both mandatory setup steps done — falls through to the normal
    // decision roll, and re-setting an already-correct tax rate is a no-op
    // from here on (never re-fires, never wastes a turn on it again).
    const turnsBefore = input.enemies[0]!.aiTurnsRemaining;
    res = applyArchetypeTurn(self.id, input, tier, 1, SEASON_DAYS, TAX, rng);
    input = { player: res.player, enemies: res.enemies };
    expect(input.enemies[0]!.taxRate).toBe(TAX);
    expect(input.enemies[0]!.aiTurnsRemaining).toBeLessThan(turnsBefore); // did something real, not a no-op
  });

  it("spends its real turn budget, never goes negative, and runs dry", () => {
    const self = seedNation("balanced");
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(2).next;
    let input: RosterTurnInput = { player, enemies: [self] };
    for (let i = 0; i < 60; i++) {
      const res = applyArchetypeTurn(self.id, input, tier, 1, SEASON_DAYS, TAX, rng);
      input = { player: res.player, enemies: res.enemies };
      expect(input.enemies[0]!.aiTurnsRemaining).toBeGreaterThanOrEqual(0);
    }
    expect(input.enemies[0]!.aiTurnsRemaining).toBe(0);
  });

  it("regression guard: a broke archetype with room to build cashes a turn instead of stalling", () => {
    // No cash, no population (so real income stays negligible even after the
    // mandatory tax-rate correction below — otherwise a healthy population's
    // income recovers so fast it never actually stays broke long enough to
    // observe the fallback), no military/spies, no Industrial Complexes (so
    // factories never passively hand it free units either) — genuinely,
    // persistently broke, not just started at 0. Every paid action is
    // unaffordable, but there's still plenty of empty land to build on once
    // it has money, so it should cash a turn for a revenue boost rather than
    // wander off exploring. This is the exact bug this whole rewrite exists
    // to fix.
    const self = seedNation("balanced", {
      cash: 0,
      population: 0,
      military: {},
      buildings: {},
      government: ARCHETYPES.balanced.government,
    });
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(3).next;
    const landBefore = self.land;
    let input: RosterTurnInput = { player, enemies: [self] };
    const log: string[] = [];
    for (let i = 0; i < 15; i++) {
      const res = applyArchetypeTurn(self.id, input, tier, 1, SEASON_DAYS, TAX, rng);
      input = { player: res.player, enemies: res.enemies };
      log.push(...res.log);
    }
    expect(input.enemies[0]!.land).toBe(landBefore); // didn't explore — no need to, there's room
    expect(log.some((l) => l.includes("cashed a turn"))).toBe(true);
  });

  it("regression guard: a broke archetype fully built out explores instead of stalling", () => {
    // Same broke setup, but every acre of land is already built on — cashing
    // a turn wouldn't unblock anything, so it should explore for more land.
    const self = seedNation("balanced", {
      cash: 0,
      population: 0,
      military: {},
      buildings: { constructionSites: 900 }, // == land, so emptyAcres() is 0
      government: ARCHETYPES.balanced.government,
    });
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(3).next;
    const landBefore = self.land;
    let input: RosterTurnInput = { player, enemies: [self] };
    for (let i = 0; i < 15; i++) {
      const res = applyArchetypeTurn(self.id, input, tier, 1, SEASON_DAYS, TAX, rng);
      input = { player: res.player, enemies: res.enemies };
    }
    expect(input.enemies[0]!.land).toBeGreaterThan(landBefore);
  });

  it("regression guard: over a full season a well-funded archetype's built acres and military both actually grow", () => {
    const self = seedNation("balanced", { government: ARCHETYPES.balanced.government });
    const player = makeNation({
      id: "player",
      isPlayer: true,
      military: { troops: 5000, jets: 5000, turrets: 5000, tanks: 5000 },
    });
    const rng = rngFromSeed(4).next;
    const acresBefore = builtAcres(self);
    const milBefore = totalMilitary(self.military);
    let input: RosterTurnInput = { player, enemies: [self] };
    for (let day = 1; day <= SEASON_DAYS; day++) {
      for (let k = 0; k < 15; k++) {
        const res = applyArchetypeTurn(self.id, input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
      }
      input = newDay(input);
    }
    expect(builtAcres(input.enemies[0]!)).toBeGreaterThan(acresBefore);
    expect(totalMilitary(input.enemies[0]!.military)).toBeGreaterThan(milBefore);
  });

  it("never attacks before attacksUnlockDay, no matter how aggressive", () => {
    const unlockDay = attacksUnlockDay(SEASON_DAYS);
    const self = seedNation("raider", { government: ARCHETYPES.raider.government });
    const player = makeNation({ id: "player", isPlayer: true, land: 800, cash: 5000, military: { troops: 20, turrets: 20, jets: 0 } });
    const rng = rngFromSeed(7).next;
    let input: RosterTurnInput = { player, enemies: [self] };
    for (let day = 1; day < unlockDay; day++) {
      for (let k = 0; k < 20; k++) {
        const res = applyArchetypeTurn(self.id, input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
        expect(res.combat).toBeUndefined();
      }
      input = newDay(input);
    }
  });

  it("attacks become possible once attacksUnlockDay is reached", () => {
    const unlockDay = attacksUnlockDay(SEASON_DAYS);
    const self = seedNation("raider", { government: ARCHETYPES.raider.government });
    const player = makeNation({ id: "player", isPlayer: true, land: 800, cash: 5000, military: { troops: 20, turrets: 20, jets: 0 } });
    const rng = rngFromSeed(7).next;
    let input: RosterTurnInput = { player, enemies: [self] };
    let sawCombat = false;
    for (let day = unlockDay; day < unlockDay + 15; day++) {
      for (let k = 0; k < 20; k++) {
        const res = applyArchetypeTurn(self.id, input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
        if (res.combat) sawCombat = true;
      }
      input = newDay(input);
    }
    expect(sawCombat).toBe(true);
  });

  it("multi-target: an archetype can fight another archetype, not just the player", () => {
    const unlockDay = attacksUnlockDay(SEASON_DAYS);
    const raider = seedNation("raider", { id: "raider", government: ARCHETYPES.raider.government });
    const weakEnemy = makeNation({
      id: "weak",
      name: "Weak",
      archetype: "economic",
      government: ARCHETYPES.economic.government,
      land: 500,
      cash: 1000,
      military: { troops: 5, turrets: 5, jets: 0 },
    });
    const player = makeNation({
      id: "player",
      isPlayer: true,
      land: 50_000,
      military: { troops: 50_000, turrets: 50_000, jets: 50_000, tanks: 50_000 },
    });
    const rng = rngFromSeed(11).next;
    let input: RosterTurnInput = { player, enemies: [raider, weakEnemy] };
    let sawEnemyVsEnemy = false;
    for (let day = unlockDay; day < unlockDay + 20 && !sawEnemyVsEnemy; day++) {
      for (let k = 0; k < 30; k++) {
        const res = applyArchetypeTurn("raider", input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
        if (res.combat && res.combat.defenderId === "weak") sawEnemyVsEnemy = true;
      }
      input = newDay(input);
    }
    expect(sawEnemyVsEnemy).toBe(true);
  });

  it("a detected failed spy op leaves a readable grudge on the defender", () => {
    // Attacker has no spies of its own worth of counter-intel, defender has
    // strong spy defense — engineered so the op fails and gets detected.
    const attacker = seedNation("raider", { id: "raider", government: ARCHETYPES.raider.government, military: { spies: 1 } });
    const target = makeNation({ id: "target", name: "Target", land: 5000, military: { spies: 50_000 } });
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(123).next;
    let input: RosterTurnInput = { player, enemies: [attacker, target] };
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      const res = applyArchetypeTurn("raider", input, tier, attacksUnlockDay(SEASON_DAYS), SEASON_DAYS, TAX, rng);
      input = { player: res.player, enemies: res.enemies };
      const t = input.enemies.find((e) => e.id === "target")!;
      if (t.grudges["raider"]) found = true;
    }
    expect(found).toBe(true);
  });

  it("backs off a target it keeps getting repelled by, and redirects elsewhere", () => {
    const startDay = attacksUnlockDay(SEASON_DAYS);
    // Healthy economy so the upkeep brake stays dormant — this test is about
    // the futility/back-off mechanic, not about affording an army. Seed a
    // grudge against the wall so it targets it first (deterministic), then
    // let the futility from repeated repels take over.
    const raider = seedNation("raider", {
      id: "raider",
      government: ARCHETYPES.raider.government,
      oil: 100_000,
      cash: 40_000,
      population: 5000,
      bushels: 200_000,
      buildings: { ...ARCHETYPES.raider.baseline.buildings, enterpriseZones: 120, residences: 90, farms: 70 },
      grudges: { wall: { againstId: "wall", score: 5, lastEventDay: startDay, lastEventLabel: "test setup" } },
    });
    // A wall the raider cannot beat — it will get repelled every time.
    const wall = makeNation({
      id: "wall",
      name: "Wall",
      archetype: "turtle",
      government: ARCHETYPES.turtle.government,
      land: 20_000,
      military: { troops: 80_000, turrets: 120_000, jets: 40_000, tanks: 20_000 },
    });
    // A soft alternative target so "redirect" has somewhere to go.
    const soft = makeNation({ id: "soft", name: "Soft", archetype: "economic", government: ARCHETYPES.economic.government, land: 600, cash: 3000, military: { troops: 20, turrets: 20 } });
    const player = makeNation({ id: "player", isPlayer: true, land: 60_000, military: { troops: 60_000, turrets: 60_000, jets: 60_000, tanks: 60_000 } });
    const rng = rngFromSeed(2026).next;

    let input: RosterTurnInput = { player, enemies: [raider, wall, soft] };
    let attackedWall = false;
    let backedOff = false;
    let wallHitWhileBackedOff = false;
    let redirectedToSoft = false;

    for (let day = startDay; day < startDay + 8; day++) {
      let backedOffToday = false;
      for (let k = 0; k < 60; k++) {
        const res = applyArchetypeTurn("raider", input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
        if (res.combat?.defenderId === "wall") {
          attackedWall = true;
          if (backedOffToday) wallHitWhileBackedOff = true;
        }
        if (res.combat?.defenderId === "soft") redirectedToSoft = true;
        const r = input.enemies.find((e) => e.id === "raider")!;
        if ((r.attackFutility["wall"] ?? 0) >= config.attackFutilityThreshold) {
          backedOff = true;
          backedOffToday = true;
        }
      }
      input = newDay(input);
    }

    expect(attackedWall).toBe(true); // it did take a swing at the wall
    expect(backedOff).toBe(true); // ...got repelled enough to cross the threshold
    expect(wallHitWhileBackedOff).toBe(false); // ...and stopped attacking it that day
    expect(redirectedToSoft).toBe(true); // ...while still hitting a target it can beat
  });

  it("decayDaily fades attackFutility so a backed-off target eventually returns", () => {
    let n = makeNation({ id: "n", attackFutility: { rival: config.attackFutilityThreshold + 1 } });
    expect(n.attackFutility["rival"]).toBeGreaterThanOrEqual(config.attackFutilityThreshold);
    for (let d = 0; d < 10 && (n.attackFutility["rival"] ?? 0) > 0; d++) n = decayDaily(n);
    expect(n.attackFutility["rival"] ?? 0).toBeLessThan(config.attackFutilityThreshold);
  });

  it("does NOT explore while it still has plenty of empty land to build on", () => {
    // 90% of its land is unbuilt — far above the explore threshold, and no
    // short run can build enough to reach it, so land never grows.
    const self = seedNation("balanced", {
      government: ARCHETYPES.balanced.government,
      land: 5000,
      buildings: { constructionSites: 30, industrialComplexes: 200, farms: 200, oilRigs: 70 },
      cash: 100_000,
    });
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(8).next;
    let input: RosterTurnInput = { player, enemies: [self] };
    for (let day = 1; day <= 6; day++) {
      for (let k = 0; k < 12; k++) {
        const res = applyArchetypeTurn(self.id, input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
      }
      input = newDay(input);
    }
    expect(input.enemies[0]!.land).toBe(5000);
  });

  it("explores to expand once empty land drops near the threshold", () => {
    // Almost fully built out (~5% empty) — explore should now come up in the
    // roll and total land should climb over the run.
    const self = seedNation("balanced", {
      government: ARCHETYPES.balanced.government,
      land: 1000,
      buildings: { constructionSites: 950 },
      cash: 200_000,
    });
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(8).next;
    const landBefore = self.land;
    let input: RosterTurnInput = { player, enemies: [self] };
    for (let day = 1; day <= 10; day++) {
      for (let k = 0; k < 15; k++) {
        const res = applyArchetypeTurn(self.id, input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
      }
      input = newDay(input);
    }
    expect(input.enemies[0]!.land).toBeGreaterThan(landBefore);
  });

  it("upkeep brake: won't buy more military when its economy can't feed it", () => {
    // Standing army whose upkeep already outruns income (net −$4k/turn), but
    // a big cash cushion to build with. It must stop buying military and
    // pour the cushion into economy to raise the ceiling instead.
    const self = seedNation("balanced", {
      government: ARCHETYPES.balanced.government,
      land: 2000,
      buildings: { constructionSites: 30, enterpriseZones: 250, residences: 180, farms: 100, industrialComplexes: 30, oilRigs: 30 },
      military: { troops: 12_000 },
      cash: 800_000,
      population: 5500,
      bushels: 500_000,
    });
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(9).next;
    let input: RosterTurnInput = { player, enemies: [self] };
    const log: string[] = [];
    for (let day = 1; day <= 5; day++) {
      for (let k = 0; k < 15; k++) {
        const res = applyArchetypeTurn(self.id, input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
        log.push(...res.log);
      }
      input = newDay(input);
    }
    expect(log.some((l) => /^Bought \d/.test(l))).toBe(false); // never grew the army
    expect(log.some((l) => /^Built \d/.test(l))).toBe(true); // built economy instead
  });

  it("upkeep brake also covers food: won't grow the army while it can't feed a bigger one", () => {
    // Net cash is comfortably positive (~+$5.6k/turn) but bushels start in a
    // per-turn deficit — far too few farms for its army. While that's true,
    // growing the army would only starve it faster, so it must not buy any;
    // once it's built enough farms to get back in the black it can resume.
    const self = seedNation("balanced", {
      government: ARCHETYPES.balanced.government,
      land: 1500,
      buildings: { enterpriseZones: 300, residences: 900, farms: 10, industrialComplexes: 100, oilRigs: 40, constructionSites: 40 },
      military: { troops: 12_000 },
      cash: 400_000,
      population: 9000,
      bushels: 500_000,
    });
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(9).next;
    let input: RosterTurnInput = { player, enemies: [self] };
    let sawDeficit = false;
    let boughtWhileStarving = false;
    let builtSomething = false;
    for (let day = 1; day <= 5; day++) {
      for (let k = 0; k < 15; k++) {
        const before = input.enemies[0]!;
        const starving = projectRates(before, 1, SEASON_DAYS, TAX).bushelsNet < 0;
        if (starving) sawDeficit = true;
        const res = applyArchetypeTurn(self.id, input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
        if (res.log.some((l) => /^Built \d/.test(l))) builtSomething = true;
        if (starving && res.log.some((l) => /^Bought \d/.test(l))) boughtWhileStarving = true;
      }
      input = newDay(input);
    }
    expect(sawDeficit).toBe(true); // the scenario really did start in a food deficit
    expect(boughtWhileStarving).toBe(false); // never grew the army while short on food
    expect(builtSomething).toBe(true); // built its way out instead
  });

  it("upkeep brake: a healthy economy still grows its military normally", () => {
    const self = seedNation("balanced", {
      government: ARCHETYPES.balanced.government,
      land: 2000,
      buildings: { constructionSites: 30, enterpriseZones: 300, residences: 200, farms: 120, industrialComplexes: 40, oilRigs: 40 },
      military: { troops: 100, turrets: 100 },
      cash: 40_000,
      population: 9000,
      bushels: 500_000,
    });
    const player = makeNation({ id: "player", isPlayer: true });
    const rng = rngFromSeed(9).next;
    let input: RosterTurnInput = { player, enemies: [self] };
    const log: string[] = [];
    for (let day = 1; day <= 5; day++) {
      for (let k = 0; k < 15; k++) {
        const res = applyArchetypeTurn(self.id, input, tier, day, SEASON_DAYS, TAX, rng);
        input = { player: res.player, enemies: res.enemies };
        log.push(...res.log);
      }
      input = newDay(input);
    }
    expect(log.some((l) => /^Bought \d/.test(l))).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const run = () => {
      const self = seedNation("balanced", { government: ARCHETYPES.balanced.government });
      const player = makeNation({ id: "player", isPlayer: true, military: { troops: 50, turrets: 50, jets: 50 } });
      const rng = rngFromSeed(55).next;
      let input: RosterTurnInput = { player, enemies: [self] };
      const trace: number[] = [];
      for (let day = 1; day <= 15; day++) {
        for (let k = 0; k < 5; k++) {
          const res = applyArchetypeTurn(self.id, input, tier, day, SEASON_DAYS, TAX, rng);
          input = { player: res.player, enemies: res.enemies };
          trace.push(totalMilitary(input.enemies[0]!.military), input.enemies[0]!.cash, totalMilitary(input.player.military));
        }
        input = newDay(input);
      }
      return trace;
    };
    expect(run()).toEqual(run());
  });
});
