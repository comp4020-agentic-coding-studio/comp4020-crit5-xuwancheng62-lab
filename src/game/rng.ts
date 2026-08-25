import type { Rng } from "./types";

// mulberry32 — a small, fast, well-mixed PRNG. Not cryptographic, doesn't
// need to be: it exists so a run is reproducible from a seed, which is what
// lets scripts/simulate-runs.ts replay a bad seed and what keeps
// spec/*.test.ts deterministic.

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Returns a value in [0, 1) and the next Rng state. Never mutates `rng`. */
export function nextFloat(rng: Rng): [number, Rng] {
  const state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { state }];
}

/** A value in [min, max). */
export function nextRange(rng: Rng, min: number, max: number): [number, Rng] {
  const [value, next] = nextFloat(rng);
  return [min + value * (max - min), next];
}

/** An integer in [min, max] inclusive. */
export function nextInt(rng: Rng, min: number, max: number): [number, Rng] {
  const [value, next] = nextFloat(rng);
  return [Math.floor(min + value * (max - min + 1)), next];
}

/** An angle in [0, 2π). */
export function nextAngle(rng: Rng): [number, Rng] {
  return nextRange(rng, 0, Math.PI * 2);
}

/** A uniformly-chosen element of a non-empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): [T, Rng] {
  const [index, next] = nextInt(rng, 0, items.length - 1);
  return [items[index], next];
}
