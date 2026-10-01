// Returns a random permutation p of 0..n-1 with p[i] !== i for every i — a
// derangement. In the prayer bowl, request i is drawn by the author of
// request p[i], so nobody draws their own.
//
// Rejection sampling: shuffle uniformly (Fisher–Yates) and retry until no
// position maps to itself. Every derangement is equally likely, and since
// about 1/e of all permutations are derangements, the expected number of
// shuffles is about e ≈ 2.72 at any n.
//
// Sattolo's algorithm would avoid the retry loop, but it only produces
// permutations that form a single cycle — for four people, 6 of the 9 valid
// draws and never the pairs-swapped ones. That bias is structural, so it is
// avoided here.
export function derangement(n: number, random: () => number = Math.random): number[] {
  if (!Number.isInteger(n) || n < 2) {
    throw new RangeError("a derangement needs at least 2 items");
  }
  for (;;) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    if (p.every((value, index) => value !== index)) return p;
  }
}
