import { describe, it, expect } from "vitest";
import { availableMilitary, restingMilitary, tickBrigades } from "./brigades";
import { makeNation } from "./factory";

describe("brigades", () => {
  it("restingMilitary sums troops/jets/tanks across every brigade", () => {
    const n = makeNation({
      military: { troops: 1000, jets: 500, turrets: 300, tanks: 100, spies: 20 },
      brigades: [
        { troops: 100, jets: 50, tanks: 10, turnsLeft: 40 },
        { troops: 200, jets: 0, tanks: 5, turnsLeft: 90 },
      ],
    });
    expect(restingMilitary(n)).toEqual({ troops: 300, jets: 50, tanks: 15 });
  });

  it("availableMilitary subtracts resting units, but never turrets or spies", () => {
    const n = makeNation({
      military: { troops: 1000, jets: 500, turrets: 300, tanks: 100, spies: 20 },
      brigades: [{ troops: 100, jets: 50, tanks: 10, turnsLeft: 40 }],
    });
    expect(availableMilitary(n)).toEqual({ troops: 900, jets: 450, turrets: 300, tanks: 90, spies: 20 });
  });

  it("availableMilitary never goes negative even if brigades somehow overcount", () => {
    const n = makeNation({
      military: { troops: 10, jets: 0, turrets: 0, tanks: 0, spies: 0 },
      brigades: [{ troops: 999, jets: 0, tanks: 0, turnsLeft: 5 }],
    });
    expect(availableMilitary(n).troops).toBe(0);
  });

  it("a nation with no brigades has everything available", () => {
    const n = makeNation({ military: { troops: 10, jets: 20, turrets: 30, tanks: 40, spies: 5 } });
    expect(availableMilitary(n)).toEqual(n.military);
  });

  it("tickBrigades counts down and drops brigades once they reach 0", () => {
    const n = makeNation({
      military: { troops: 100, jets: 0, turrets: 0, tanks: 0, spies: 0 },
      brigades: [
        { troops: 50, jets: 0, tanks: 0, turnsLeft: 10 },
        { troops: 50, jets: 0, tanks: 0, turnsLeft: 3 },
      ],
    });
    const after = tickBrigades(n, 5);
    expect(after.brigades).toHaveLength(1);
    expect(after.brigades[0]).toEqual({ troops: 50, jets: 0, tanks: 0, turnsLeft: 5 });
    // The expired brigade's units were never removed from `military` — they
    // were only reserved against it — so nothing needs to be "returned."
    expect(after.military.troops).toBe(100);
  });

  it("returns the same object reference when there's nothing to tick (no waste)", () => {
    const n = makeNation({ brigades: [] });
    expect(tickBrigades(n, 5)).toBe(n);
    const n2 = makeNation({ brigades: [{ troops: 10, jets: 0, tanks: 0, turnsLeft: 5 }] });
    expect(tickBrigades(n2, 0)).toBe(n2);
  });

  it("carries over across many small ticks the same as one big tick", () => {
    const n = makeNation({ brigades: [{ troops: 10, jets: 0, tanks: 0, turnsLeft: 100 }] });
    let stepped = n;
    for (let i = 0; i < 20; i++) stepped = tickBrigades(stepped, 5); // 20 x 5 = 100
    expect(stepped.brigades).toHaveLength(0);
  });
});
