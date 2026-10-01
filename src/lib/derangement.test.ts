import { describe, expect, it } from "vitest";
import { derangement } from "./derangement";

describe("derangement", () => {
  it("is a permutation with no fixed points, for every size from 2 to 40", () => {
    for (let n = 2; n <= 40; n++) {
      for (let trial = 0; trial < 50; trial++) {
        const p = derangement(n);
        expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
        p.forEach((value, index) => expect(value).not.toBe(index));
      }
    }
  });

  it("swaps two items", () => {
    expect(derangement(2)).toEqual([1, 0]);
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
    const seen = new Set<string>();
    for (let trial = 0; trial < 5000; trial++) {
      seen.add(derangement(4).join(","));
    }
    expect(seen.size).toBe(9);
    expect(seen.has("1,0,3,2")).toBe(true);
  });
});
