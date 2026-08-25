// Every pacing number that determines difficulty, in one file. This is what
// playtesting will change most: the spec's own required "one change from
// playing, not reading code" is expected to land here. Nothing about it
// depends on the viewport — spawn position is a fixed world-radius ring
// around the player, spawn cadence is elapsed-time/enemy-count-based — which
// is what keeps difficulty comparable at 1920x1080 and 390x844 alike.

export interface SpawnTuning {
  readonly shooterIntroducedAtSeconds: number;
  readonly tankIntroducedAtSeconds: number;
  readonly spawnIntervalAt: (elapsedSeconds: number) => number;
  readonly maxAliveEnemies: number;
  readonly spawnRingRadius: number;
}

function defaultSpawnInterval(elapsedSeconds: number): number {
  const startInterval = 1.6;
  const minInterval = 0.4;
  const rampSeconds = 60;
  const t = Math.min(1, Math.max(0, elapsedSeconds / rampSeconds));
  return startInterval + (minInterval - startInterval) * t;
}

export const DEFAULT_SPAWN_TUNING: SpawnTuning = {
  shooterIntroducedAtSeconds: 20,
  tankIntroducedAtSeconds: 40,
  spawnIntervalAt: defaultSpawnInterval,
  maxAliveEnemies: 40,
  spawnRingRadius: 420,
};
