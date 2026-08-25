// Shared primitives. No DOM, no Canvas, no AudioContext — every file in
// src/game/ stays importable under jsdom (and under plain Node, for
// scripts/simulate-runs.ts) for exactly the reason crit4's CLAUDE.md
// documents: a module that merely *imports* a browser-only API is untestable
// even before anything calls it.

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export interface Circle {
  readonly pos: Vector2;
  readonly radius: number;
}

/**
 * Immutable PRNG state. Every draw returns a *new* Rng alongside the value,
 * never mutates in place — this is what makes step() a pure function of its
 * inputs and what lets scripts/simulate-runs.ts replay a seed exactly.
 * Never reach for Math.random() anywhere under src/game/.
 */
export interface Rng {
  readonly state: number;
}

export type EntityId = string;
