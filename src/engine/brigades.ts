/**
 * Planned Strike brigades. Only Planned Strike ties up forces — every other
 * attack type returns forces to the standing army immediately (matches the
 * wiki: "for all attacks, except planned strikes this is done immediately").
 *
 * A resting brigade's units stay counted in `Nation.military` the whole time
 * (still fed, still paid upkeep, still part of net worth — they're not gone,
 * just not combat-ready) — `availableMilitary` is what subtracts them out for
 * anything that actually needs "can this unit fight right now."
 */

import type { Brigade, Military, Nation } from "./types";

/** Troops/jets/tanks currently resting across every brigade this nation has out. */
export function restingMilitary(n: Nation): { troops: number; jets: number; tanks: number } {
  return n.brigades.reduce(
    (sum, b) => ({ troops: sum.troops + b.troops, jets: sum.jets + b.jets, tanks: sum.tanks + b.tanks }),
    { troops: 0, jets: 0, tanks: 0 },
  );
}

/** Total of every unit type currently pulled off the wall by recent attacks
 * (see `Nation.defenseSuppression`). */
export function suppressedMilitary(n: Nation): Military {
  return (n.defenseSuppression ?? []).reduce(
    (s, f) => ({
      troops: s.troops + f.troops,
      jets: s.jets + f.jets,
      turrets: s.turrets + f.turrets,
      tanks: s.tanks + f.tanks,
      spies: s.spies + f.spies,
    }),
    { troops: 0, jets: 0, turrets: 0, tanks: 0, spies: 0 },
  );
}

/** Military actually usable right now — for sending on a new attack, or for
 * defending against one. Total minus whatever's resting in a brigade minus
 * whatever recent attacks have knocked off the wall (`defenseSuppression`). */
export function availableMilitary(n: Nation): Military {
  const resting = restingMilitary(n);
  const sup = suppressedMilitary(n);
  return {
    troops: Math.max(0, n.military.troops - resting.troops - sup.troops),
    jets: Math.max(0, n.military.jets - resting.jets - sup.jets),
    turrets: Math.max(0, n.military.turrets - sup.turrets),
    tanks: Math.max(0, n.military.tanks - resting.tanks - sup.tanks),
    spies: Math.max(0, n.military.spies - sup.spies),
  };
}

/** Advance every resting brigade by however many turns were just spent, and
 * drop any that have finished resting. Nothing needs to be added back to
 * `military` — a brigade's units were never removed from it, only "reserved"
 * against it via `availableMilitary`. */
export function tickBrigades(n: Nation, turnsSpent: number): Nation {
  if (n.brigades.length === 0 || turnsSpent <= 0) return n;
  const brigades: Brigade[] = [];
  for (const b of n.brigades) {
    const turnsLeft = b.turnsLeft - turnsSpent;
    if (turnsLeft > 0) brigades.push({ ...b, turnsLeft });
  }
  return { ...n, brigades };
}
