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

/** Military actually usable right now — for sending on a new attack, or for
 * defending against one. Total minus whatever's resting in a brigade. Turrets
 * and spies never deploy on an attack, so they're always fully available. */
export function availableMilitary(n: Nation): Military {
  const resting = restingMilitary(n);
  return {
    troops: Math.max(0, n.military.troops - resting.troops),
    jets: Math.max(0, n.military.jets - resting.jets),
    turrets: n.military.turrets,
    tanks: Math.max(0, n.military.tanks - resting.tanks),
    spies: n.military.spies,
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
