/**
 * Seeded PRNG (mulberry32). Chosen because its entire state is a single uint32,
 * which makes the world save trivially serializable and every run reproducible.
 */

import type { Rng } from "./types";

export interface SeededRng {
  /** Next float in [0, 1). */
  next: Rng;
  /** Current internal state — persist this, restore with `createRng`. */
  getState: () => number;
}

/** Hash an arbitrary integer seed into a well-distributed uint32 state. */
export function seedToState(seed: number): number {
  let x = seed >>> 0;
  x = (x ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}

/**
 * Create an RNG from a raw internal state (not a user seed — pass the value from
 * `seedToState` or a previously persisted `getState()`).
 */
export function createRng(state: number): SeededRng {
  let a = state >>> 0;
  const next: Rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, getState: () => a >>> 0 };
}

/** Convenience: build an RNG straight from a human-facing integer seed. */
export function rngFromSeed(seed: number): SeededRng {
  return createRng(seedToState(seed));
}

/** Integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Float in [min, max). */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
