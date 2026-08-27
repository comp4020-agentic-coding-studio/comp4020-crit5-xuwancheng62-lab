// Every pacing number that determines difficulty, in one file. This is what
// playtesting will change most: the spec's own required "one change from
// playing, not reading code" is expected to land here. Nothing about it
// depends on the viewport — spawn position is a fixed world-radius ring
// around the player, spawn cadence is elapsed-time/enemy-count-based — which
// is what keeps difficulty comparable at 1920x1080 and 390x844 alike.

import { WORLD_RADIUS } from "../world-bounds";

/** The tuning below (spawn ring radius, alive-enemy caps, spawn interval)
 * was originally calibrated for a WORLD_RADIUS of 560. Deriving from that
 * ratio — rather than hardcoding new numbers — means a future world-size
 * change doesn't silently leave enemy density wrong again. */
const CALIBRATED_WORLD_RADIUS = 560;
const CALIBRATED_SPAWN_RING_RADIUS = 300;
const WORLD_RADIUS_RATIO = WORLD_RADIUS / CALIBRATED_WORLD_RADIUS;
/** Density target: enemies-per-unit-area should land at ~80% of what it was
 * before the world shrink, not simply "the same count in a smaller map"
 * (which would make it feel *more* crowded) — newCount = oldCount *
 * (newArea/oldArea) * 0.8. The playable world is a circle, so area scales
 * with the radius ratio squared. */
const DENSITY_FACTOR = WORLD_RADIUS_RATIO ** 2 * 0.8;

/** Survive this long and you win. Placeholder — the spec asks for "a
 * stranger reaches an ending inside five minutes", not that the run itself
 * lasts five minutes; this is deliberately much shorter pending playtesting. */
export const RUN_LENGTH_SECONDS = 90;

export interface SpawnTuning {
  readonly shooterIntroducedAtSeconds: number;
  readonly tankIntroducedAtSeconds: number;
  readonly spawnIntervalAt: (elapsedSeconds: number) => number;
  readonly maxAliveEnemiesAt: (elapsedSeconds: number) => number;
  readonly spawnRingRadius: number;
}

/** Both spawn rate and the alive-enemy cap ramp up over this much of the
 * run — most of it, not just its opening — so a run reads as "starts easy,
 * keeps getting harder all the way through" rather than "hard within the
 * first ten seconds, flat for the rest." The final stretch past this point
 * is deliberately left at max intensity as the run's climax. */
const DIFFICULTY_RAMP_SECONDS = Math.round(RUN_LENGTH_SECONDS * 0.5);

function rampFraction(elapsedSeconds: number): number {
  return Math.min(1, Math.max(0, elapsedSeconds / DIFFICULTY_RAMP_SECONDS));
}

function defaultSpawnInterval(elapsedSeconds: number): number {
  // Lower density -> a slower spawn rate, by the same DENSITY_FACTOR that
  // shrinks the alive-enemy cap below — interval is 1/rate, so it divides
  // rather than multiplies.
  const startInterval = 1.0 / DENSITY_FACTOR; // opening: gentle, but not idle
  const minInterval = 0.09 / DENSITY_FACTOR; // climax: a steady stream, not a firehose
  return startInterval + (minInterval - startInterval) * rampFraction(elapsedSeconds);
}

function defaultMaxAliveEnemies(elapsedSeconds: number): number {
  const startCap = Math.round(6 * DENSITY_FACTOR); // opening: a handful of rushers, never a swarm
  const endCap = Math.round(45 * DENSITY_FACTOR);
  return Math.round(startCap + (endCap - startCap) * rampFraction(elapsedSeconds));
}

export const DEFAULT_SPAWN_TUNING: SpawnTuning = {
  shooterIntroducedAtSeconds: 12,
  tankIntroducedAtSeconds: 25,
  spawnIntervalAt: defaultSpawnInterval,
  maxAliveEnemiesAt: defaultMaxAliveEnemies,
  // Scaled down with the world so a spawn still reads as "just outside
  // immediate view" rather than "most of the way across the map".
  spawnRingRadius: CALIBRATED_SPAWN_RING_RADIUS * WORLD_RADIUS_RATIO,
};
