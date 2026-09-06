import { describe, it, expect } from "vitest";
import { createRng, rngFromSeed, seedToState, randInt } from "./rng";

describe("mulberry32 rng", () => {
  it("is deterministic for a given seed", () => {
    const a = rngFromSeed(12345);
    const b = rngFromSeed(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = rngFromSeed(1);
    const b = rngFromSeed(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("stays within [0, 1)", () => {
    const r = rngFromSeed(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("can be serialized mid-stream and resumed exactly", () => {
    const r = rngFromSeed(777);
    for (let i = 0; i < 13; i++) r.next();
    const snapshot = r.getState();
    const expectedTail = Array.from({ length: 10 }, () => r.next());

    const resumed = createRng(snapshot);
    const actualTail = Array.from({ length: 10 }, () => resumed.next());
    expect(actualTail).toEqual(expectedTail);
  });

  it("seedToState spreads nearby seeds apart", () => {
    expect(seedToState(0)).not.toEqual(seedToState(1));
    expect(seedToState(1)).not.toEqual(seedToState(2));
  });

  it("randInt covers an inclusive range without escaping it", () => {
    const r = rngFromSeed(5);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = randInt(r.next, 1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });
});
