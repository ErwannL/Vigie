/** Small deterministic PRNG helpers so the demo dataset is identical on every run. */
export function createRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const hex = (n) => Array.from({ length: n }, () => int(0, 15).toString(16)).join('');
  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Picks a key of `weights` ({ key: weight }) proportionally to its weight. */
    weighted(weights) {
      const entries = Object.entries(weights);
      let roll = next() * entries.reduce((sum, [, w]) => sum + w, 0);
      for (const [key, w] of entries) {
        roll -= w;
        if (roll < 0) return key;
      }
      return entries[entries.length - 1][0];
    },
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`,
    id: (prefix) => `${prefix}_${hex(16)}`,
    /** Log-normal-ish duration around `median` ms. */
    duration(median) {
      const u = Math.max(next(), 1e-6);
      return Math.max(
        5,
        Math.round(
          median * Math.exp(0.45 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())),
        ),
      );
    },
  };
}
