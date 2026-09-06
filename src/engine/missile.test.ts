import { describe, it, expect } from "vitest";
import { resolveMissile } from "./missile";
import { config } from "./config";
import { makeNation } from "./factory";
import type { Rng } from "./types";

const noIntercept = (): Rng => () => 0.99; // beats any SDI chance (0 with no sdi tech)
const alwaysIntercept = (): Rng => () => 0; // beats an SDI chance > 0

describe("resolveMissile — nuclear", () => {
  const attacker = () => makeNation({ id: "a", name: "A", missiles: { chemical: 0, cruise: 0, nuclear: 5 }, oil: 5000 });

  it("no longer protects the player below the old 400-acre floor", () => {
    // Old behaviour clamped landDestroyed to `land - 400`, i.e. 0 for any
    // player under 400 acres — a nuke could do nothing at all. Now it's the
    // same rule as any other nation: destroy up to what's actually there.
    const player = makeNation({ id: "player", isPlayer: true, land: 200 });
    const { result, defender } = resolveMissile(attacker(), player, "nuclear", noIntercept());
    expect(result.landDestroyed).toBeGreaterThan(0);
    expect(defender.land).toBe(200 - result.landDestroyed);
  });

  it("can eliminate the player, same as any AI nation", () => {
    const player = makeNation({ id: "player", isPlayer: true, land: 100 });
    const { result, defender } = resolveMissile(attacker(), player, "nuclear", noIntercept());
    expect(defender.land).toBeLessThan(config.defeatLandFloor);
    expect(result.defenderDefeated).toBe(true);
    expect(defender.defeated).toBe(true);
  });

  it("still eliminates a weak AI nation the same way", () => {
    const enemy = makeNation({ id: "enemy", land: 100 });
    const { result, defender } = resolveMissile(attacker(), enemy, "nuclear", noIntercept());
    expect(defender.land).toBeLessThan(config.defeatLandFloor);
    expect(result.defenderDefeated).toBe(true);
    expect(defender.defeated).toBe(true);
  });

  it("an intercepted strike does nothing and defeats no one", () => {
    const player = makeNation({ id: "player", isPlayer: true, land: 50, tech: { sdi: 200 } });
    const { result, defender } = resolveMissile(attacker(), player, "nuclear", alwaysIntercept());
    expect(result.intercepted).toBe(true);
    expect(result.landDestroyed).toBe(0);
    expect(result.defenderDefeated).toBe(false);
    expect(defender.land).toBe(50);
  });
});
