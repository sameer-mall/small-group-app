import { describe, expect, it } from "vitest";
import { derangement } from "./derangement";

// A deterministic PRNG so any failure reproduces exactly. mulberry32 is a
// small, well-known 32-bit generator; its quality is ample for a test.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("derangement", () => {
  it("is a permutation with no fixed points, for every size from 2 to 40", () => {
    const random = mulberry32(1);
    for (let n = 2; n <= 40; n++) {
      for (let trial = 0; trial < 50; trial++) {
        const p = derangement(n, random);
        expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
        p.forEach((value, index) => expect(value).not.toBe(index));
      }
    }
  });

  it("always swaps two items", () => {
    const random = mulberry32(2);
    for (let trial = 0; trial < 20; trial++) {
      expect(derangement(2, random)).toEqual([1, 0]);
    }
  });

  it("refuses fewer than two items", () => {
    expect(() => derangement(0)).toThrow(RangeError);
    expect(() => derangement(1)).toThrow(RangeError);
  });

  // The test that separates a uniform sampler from Sattolo's algorithm. Both
  // pass every test above, but Sattolo's only ever produces a single cycle:
  // for four items, the six 4-cycles and never the three pairs-swapped draws
  // such as [1, 0, 3, 2].
  it("reaches all nine derangements of four items", () => {
    const random = mulberry32(3);
    const seen = new Set<string>();
    for (let trial = 0; trial < 5000; trial++) {
      seen.add(derangement(4, random).join(","));
    }
    expect(seen.size).toBe(9);
    expect(seen.has("1,0,3,2")).toBe(true);
  });

  it("falls back to Math.random when no source is given", () => {
    const p = derangement(6);
    p.forEach((value, index) => expect(value).not.toBe(index));
  });
});
