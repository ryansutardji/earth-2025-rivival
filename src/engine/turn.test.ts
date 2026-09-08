import { describe, it, expect } from "vitest";
import { applyPlayerTurn } from "./turn";
import { createWorld } from "./world";
import { config } from "./config";
import { zeroMilitary } from "./factory";
import { generateSeason } from "./season";
import { getTier } from "../data/difficultyTiers";
import { availableMilitary } from "./brigades";
import { gov } from "./government";
import type { Military, SeasonConfig, WorldState } from "./types";

const cfg: SeasonConfig = {
  tierId: "recruit",
  rosterSize: 2,
  eligibleArchetypes: ["raider", "economic"],
  seasonLengthDays: 30,
  playerGovernment: "monarchy",
  seed: 123,
};

const mil = (o: Partial<Military>): Military => ({ ...zeroMilitary(), ...o });

describe("applyPlayerTurn — actions", () => {
  it("build spends turns and adds acres; the world then ticks", () => {
    const w0 = createWorld(cfg);
    const out = applyPlayerTurn(w0, { kind: "build", buildingType: "enterpriseZones", acres: 10 });
    expect(out.ok).toBe(true);
    expect(out.world.player.buildings.enterpriseZones).toBeGreaterThan(w0.player.buildings.enterpriseZones);
    expect(w0.player.buildings.enterpriseZones).toBeLessThan(out.world.player.buildings.enterpriseZones);
  });

  it("rejects an impossible action and returns the same world reference", () => {
    const w0 = createWorld(cfg);
    const broke: WorldState = { ...w0, player: { ...w0.player, cash: 0 } };
    const out = applyPlayerTurn(broke, { kind: "build", buildingType: "farms", acres: 40 });
    expect(out.ok).toBe(false);
    expect(out.world).toBe(broke);
  });

  it("policy actions: tax, production mix, research focus, government", () => {
    let w = createWorld(cfg);
    w = applyPlayerTurn(w, { kind: "setTaxRate", rate: 0.55 }).world;
    expect(w.player.taxRate).toBe(0.55);
    w = applyPlayerTurn(w, { kind: "setProduction", mix: { jets: 100, troops: 0, turrets: 0, tanks: 0, spies: 0 } }).world;
    expect(w.player.production.jets).toBe(100);
    w = applyPlayerTurn(w, { kind: "setResearchFocus", focus: "weapons" }).world;
    expect(w.player.researchFocus).toBe("weapons");
    w = applyPlayerTurn(w, { kind: "setGovernment", government: "tyranny" }).world;
    expect(w.player.government).toBe("tyranny");
  });

  it("a Cash turn boosts that tick's revenue", () => {
    const w0 = createWorld(cfg);
    const plain = applyPlayerTurn(w0, { kind: "explore" }).world.player.cash;
    const cashed = applyPlayerTurn(w0, { kind: "cash" }).world.player.cash;
    expect(cashed).toBeGreaterThan(plain);
  });

  it("attack: costs the government's turns-to-attack and needs oil", () => {
    const w0 = createWorld(cfg);
    const dry: WorldState = { ...w0, player: { ...w0.player, oil: 0 } };
    expect(applyPlayerTurn(dry, { kind: "attack", targetId: w0.enemies[0]!.id, attackType: "standard" }).ok).toBe(false);

    const armed: WorldState = { ...w0, day: 10, player: { ...w0.player, oil: 100_000, military: mil({ troops: 200_000, tanks: 50_000 }) } };
    const out = applyPlayerTurn(armed, { kind: "attack", targetId: w0.enemies[0]!.id, attackType: "standard" });
    expect(out.ok).toBe(true);
    expect(out.world.turnsRemaining).toBe(config.turnPoolCap - 2); // monarchy = 2
    expect(out.battleReport).toBeDefined();
  });

  it("attack and launchMissile are rejected before the season's build-up window ends", () => {
    const w0 = createWorld(cfg); // seasonLengthDays: 30 => unlocks day 7 (days 1-6 fully blocked)
    const armed: WorldState = {
      ...w0,
      day: 5,
      player: { ...w0.player, oil: 100_000, military: mil({ troops: 200_000, tanks: 50_000 }), missiles: { chemical: 5, cruise: 0, nuclear: 0 } },
    };
    const attack = applyPlayerTurn(armed, { kind: "attack", targetId: w0.enemies[0]!.id, attackType: "standard" });
    expect(attack.ok).toBe(false);
    expect(attack.error).toMatch(/day 7/);
    const missile = applyPlayerTurn(armed, { kind: "launchMissile", targetId: w0.enemies[0]!.id, missile: "chemical" });
    expect(missile.ok).toBe(false);
    expect(missile.error).toMatch(/day 7/);

    // Non-attack actions are unaffected during the same window.
    expect(applyPlayerTurn(armed, { kind: "explore" }).ok).toBe(true);
  });

  describe("Planned Strike brigades", () => {
    const armedWorld = (): WorldState => {
      const w0 = createWorld(cfg);
      return {
        ...w0,
        day: 10,
        // cash is bumped way up too — 200K troops + 50K tanks costs far more
        // upkeep per turn than the default treasury covers, which would
        // trigger a cash-crisis desertion event (scaling down ALL military)
        // on the very first economy tick and make every count below a lie.
        player: { ...w0.player, cash: 100_000_000, oil: 100_000, military: mil({ troops: 200_000, tanks: 50_000 }) },
        // Neutered so an archetype can never counter-attack mid-test and add
        // unrelated combat noise to the player's military — these tests are
        // about the brigade mechanic, not enemy behavior.
        enemies: w0.enemies.map((e) => ({ ...e, military: zeroMilitary() })),
      };
    };

    it("a planned strike sends the requested quantity and rests the survivors", () => {
      const w0 = armedWorld();
      const out = applyPlayerTurn(w0, { kind: "attack", targetId: w0.enemies[0]!.id, attackType: "planned", send: { troops: 1000 } });
      expect(out.ok).toBe(true);
      expect(out.battleReport?.sent.troops).toBe(1000);
      expect(out.world.player.brigades).toHaveLength(1);
      // The rest timer already ticked down by the turns this very attack
      // cost (advanceWorldTick runs on every action, including this one).
      const attackCost = gov(w0.player.government).turnsToAttack;
      expect(out.world.player.brigades[0]!.turnsLeft).toBe(config.plannedStrikeRestTurns - attackCost);
      // The other ~199,000 troops never left home and are still available.
      expect(availableMilitary(out.world.player).troops).toBeGreaterThan(198_000);
    });

    it("rejects a request for more than what's currently available", () => {
      const w0 = armedWorld();
      const out = applyPlayerTurn(w0, { kind: "attack", targetId: w0.enemies[0]!.id, attackType: "standard", send: { troops: 10_000_000 } });
      expect(out.ok).toBe(false);
      expect(out.error).toMatch(/available/);
    });

    it("caps concurrent brigades at maxBrigades", () => {
      let world = armedWorld();
      for (let i = 0; i < config.maxBrigades; i++) {
        const out = applyPlayerTurn(world, { kind: "attack", targetId: world.enemies[0]!.id, attackType: "planned", send: { troops: 100 } });
        expect(out.ok).toBe(true);
        world = out.world;
      }
      expect(world.player.brigades).toHaveLength(config.maxBrigades);
      const rejected = applyPlayerTurn(world, { kind: "attack", targetId: world.enemies[0]!.id, attackType: "planned", send: { troops: 100 } });
      expect(rejected.ok).toBe(false);
      expect(rejected.error).toMatch(/brigades are resting/);
      // A non-planned attack is unaffected by a full brigade roster.
      const standard = applyPlayerTurn(world, { kind: "attack", targetId: world.enemies[0]!.id, attackType: "standard", send: { troops: 100 } });
      expect(standard.ok).toBe(true);
    });

    it("the rest countdown carries across End Day instead of resetting, and returns the units once it reaches 0", () => {
      let world = armedWorld();
      const launch = applyPlayerTurn(world, { kind: "attack", targetId: world.enemies[0]!.id, attackType: "planned", send: { troops: 1000 } });
      expect(launch.ok).toBe(true);
      world = launch.world;
      const restingTroops = world.player.brigades[0]!.troops;
      expect(restingTroops).toBeGreaterThan(0);

      // Spend turns across several days via a cheap 1-turn action, rolling
      // through End Day (which must NOT reset the brigade timer) whenever the
      // pool empties, until the brigade finishes resting on its own.
      let guard = 0;
      while (world.player.brigades.length > 0 && guard++ < 500) {
        world = applyPlayerTurn(world, world.turnsRemaining < 1 ? { kind: "endDay" } : { kind: "cash" }).world;
      }
      expect(world.player.brigades).toHaveLength(0);
      expect(world.day).toBeGreaterThan(10); // proves it carried across at least one End Day
      expect(availableMilitary(world.player).troops).toBeGreaterThanOrEqual(restingTroops - 1); // back, allow rounding
    });
  });

  it("covert op: needs spies, records intel on a Spy op, raises heat on a harmful op", () => {
    const w0 = createWorld(cfg);
    const spied: WorldState = { ...w0, player: { ...w0.player, military: mil({ spies: 500_000 }) } };
    const id = w0.enemies[0]!.id;

    const recon = applyPlayerTurn(spied, { kind: "covertOp", targetId: id, op: "spy" });
    expect(recon.ok).toBe(true);
    expect(recon.world.player.intel[id]).toBeDefined();
    expect(recon.world.enemies.find((e) => e.id === id)!.covertHeat).toBe(0);

    const bomb = applyPlayerTurn(spied, { kind: "covertOp", targetId: id, op: "bombBuildings" });
    expect(bomb.world.enemies.find((e) => e.id === id)!.covertHeat).toBeGreaterThan(0);
  });

  it("launchMissile: rejected without a missile, works with one", () => {
    const w0 = createWorld(cfg);
    expect(applyPlayerTurn(w0, { kind: "launchMissile", targetId: w0.enemies[0]!.id, missile: "nuclear" }).ok).toBe(false);

    const armed: WorldState = { ...w0, day: 10, player: { ...w0.player, oil: 100_000, missiles: { chemical: 5, cruise: 0, nuclear: 0 } } };
    const out = applyPlayerTurn(armed, { kind: "launchMissile", targetId: w0.enemies[0]!.id, missile: "chemical" });
    expect(out.ok).toBe(true);
    expect(out.world.player.missiles.chemical).toBe(4);
    expect(out.missileReport).toBeDefined();
  });

  it("market + demolish flow through", () => {
    let w = createWorld(cfg);
    w = { ...w, player: { ...w.player, cash: 50_000 } }; // headroom for the market buy — test is about the flow, not the economy
    const jets0 = w.player.military.jets;
    w = applyPlayerTurn(w, { kind: "marketBuy", good: "jets", qty: 50 }).world;
    expect(w.player.military.jets).toBeGreaterThanOrEqual(jets0 + 50);
    const farms0 = w.player.buildings.farms;
    w = applyPlayerTurn(w, { kind: "demolish", buildingType: "farms", acres: 10 }).world;
    expect(w.player.buildings.farms).toBe(farms0 - 10);
  });

  it("is deterministic: same world + same actions => identical state", () => {
    const actions = [
      { kind: "build" as const, buildingType: "industrialComplexes" as const, acres: 5 },
      { kind: "marketBuy" as const, good: "bushels" as const, qty: 500 },
      { kind: "marketSell" as const, good: "troops" as const, qty: 10 },
      { kind: "cash" as const },
      { kind: "explore" as const },
      { kind: "endDay" as const },
    ];
    const run = () => {
      let w = createWorld(cfg);
      for (const a of actions) w = applyPlayerTurn(w, a).world;
      return w;
    };
    expect(run()).toEqual(run());
  });

  it("does not mutate the previous world", () => {
    const w0 = createWorld(cfg);
    const snap = JSON.stringify(w0);
    applyPlayerTurn(w0, { kind: "endDay" });
    applyPlayerTurn(w0, { kind: "marketBuy", good: "bushels", qty: 100 });
    expect(JSON.stringify(w0)).toBe(snap);
  });

  it("the market drifts each world tick", () => {
    let w = createWorld(cfg);
    const before = w.market.jets.price;
    for (let i = 0; i < 8; i++) w = applyPlayerTurn(w, { kind: "endDay" }).world;
    expect(w.market.jets.price).not.toBe(before);
  });
});

describe("createWorld", () => {
  it("produces the roster, a full turn pool, and honours the player government", () => {
    const w = createWorld({ ...cfg, rosterSize: 5, playerGovernment: "fascism" });
    expect(w.enemies).toHaveLength(5);
    expect(w.turnsRemaining).toBe(config.turnPoolCap);
    expect(w.status).toBe("playing");
    expect(w.player.government).toBe("fascism");
    expect(w.player.covertHeat).toBe(0);
  });

  it("rolls a tax comfort threshold within range, deterministic per seed", () => {
    const [lo, hi] = config.taxComfortThresholdRange;
    const a = createWorld({ ...cfg, seed: 999 });
    const b = createWorld({ ...cfg, seed: 999 });
    const c = createWorld({ ...cfg, seed: 1000 });
    expect(a.taxComfortThreshold).toBeGreaterThanOrEqual(lo);
    expect(a.taxComfortThreshold).toBeLessThan(hi);
    expect(a.taxComfortThreshold).toBe(b.taxComfortThreshold); // same seed => same roll
    expect(a.taxComfortThreshold).not.toBe(c.taxComfortThreshold); // different seed => (almost certainly) different roll
  });

  it("the tax threshold roll is decorrelated — doesn't shift roster generation", () => {
    // generateSeason is called with the same seed/tier either way; if the new
    // threshold roll shared a stream with it, the roster would differ from
    // calling generateSeason directly with the same inputs.
    const w = createWorld({ ...cfg, seed: 42 });
    const directRoster = generateSeason({ ...cfg, seed: 42 }, getTier(cfg.tierId));
    expect(w.enemies.map((e) => e.name)).toEqual(directRoster.map((e) => e.name));
  });
});

describe("season end (hybrid win condition)", () => {
  const runToDeadline = (w0: WorldState) => {
    let w = w0;
    for (let i = 0; i < w0.seasonLengthDays + 2 && w.status === "playing"; i++) {
      w = applyPlayerTurn(w, { kind: "endDay" }).world;
    }
    return w;
  };

  it("deadline as #1 net worth → net-worth victory", () => {
    let world = createWorld({ ...cfg, seasonLengthDays: 10 });
    // A dominant economy, plus a wall to hold it (a passive player gets its
    // land farmed away over 10 days otherwise) and farms so it stays fed —
    // this test is about the deadline win condition, not survival.
    world = {
      ...world,
      player: {
        ...world.player,
        cash: 20_000_000,
        land: 60_000,
        bushels: 10 ** 8,
        buildings: { ...world.player.buildings, enterpriseZones: 10_000, farms: 5_000 },
        military: { ...zeroMilitary(), troops: 5_000, turrets: 200_000 },
      },
    };
    expect(runToDeadline(world).status).toBe("won_networth");
  });

  it("deadline behind on net worth → loss", () => {
    // A short season and a wall far too big to crack — the player survives to
    // the deadline with zero economy, so it loses on points to nations that
    // actually grew.
    let world = createWorld({ ...cfg, seasonLengthDays: 6, tierId: "recruit", eligibleArchetypes: ["turtle"], rosterSize: 2 });
    world = {
      ...world,
      player: {
        ...world.player,
        cash: 0,
        land: 2_000,
        bushels: 10_000_000,
        oil: 0,
        buildings: { ...world.player.buildings, enterpriseZones: 0, farms: 0 },
        military: { ...zeroMilitary(), troops: 5_000, turrets: 400_000 },
      },
    };
    expect(runToDeadline(world).status).toBe("lost_networth");
  });

  it("clearing the roster early → elimination victory", () => {
    // Short season: a longer one lets the (economic) enemies out-explore the
    // grind — an economy-balance property, not what this test is about. This
    // test only checks that clearing the whole roster fires the elimination
    // victory, so keep the window tight enough that an overwhelming army does.
    let world = createWorld({ ...cfg, seasonLengthDays: 8, eligibleArchetypes: ["economic"], rosterSize: 2 });
    world = {
      ...world,
      player: { ...world.player, oil: 10 ** 8, bushels: 10 ** 8, population: 3000, military: mil({ troops: 800_000, tanks: 400_000 }) },
      enemies: world.enemies.map((e) => ({ ...e, land: 140, cash: 100, military: mil({ troops: 10, turrets: 10 }) })),
    };
    let guard = 0;
    while (world.status === "playing" && guard++ < 400) {
      const alive = world.enemies.find((e) => !e.defeated);
      if (!alive) break;
      let out = applyPlayerTurn(world, { kind: "attack", targetId: alive.id, attackType: "standard" });
      if (!out.ok) out = applyPlayerTurn(world, { kind: "endDay" });
      world = out.world;
    }
    expect(world.status).toBe("won_elimination");
  });

  it("the player being flipped to defeated → elimination loss, same status shape as a won elimination", () => {
    // Mirrors "clearing the roster early → elimination victory" from the other
    // side: resolveCombat/resolveMissile can now flip the player's `defeated`
    // flag (same land/army floor as any AI nation) — resolveSeasonEnd must
    // catch it and end the season as a loss, not silently keep playing.
    let world = createWorld({ ...cfg, seasonLengthDays: 40, eligibleArchetypes: ["economic"], rosterSize: 2 });
    world = { ...world, player: { ...world.player, defeated: true } };
    const out = applyPlayerTurn(world, { kind: "endDay" });
    expect(out.world.status).toBe("lost_eliminated");
  });

  it("actions are rejected once the season is over", () => {
    const world = runToDeadline(createWorld({ ...cfg, seasonLengthDays: 6 }));
    expect(world.status).not.toBe("playing");
    const out = applyPlayerTurn(world, { kind: "endDay" });
    expect(out.ok).toBe(false);
    expect(out.world).toBe(world);
  });
});
