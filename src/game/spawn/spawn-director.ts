import type { EnemyKind } from "../entities/enemies";
import { nextAngle, pick } from "../rng";
import type { SpawnTuning } from "./spawn-tuning";
import type { Rng, Vector2 } from "../types";
import { add, fromAngle } from "../vector";

export interface SpawnDirectorState {
  readonly nextSpawnAt: number; // absolute elapsedSeconds
}

export const INITIAL_SPAWN_DIRECTOR_STATE: SpawnDirectorState = { nextSpawnAt: 0 };

export interface EnemySpawnRequest {
  readonly kind: EnemyKind;
  readonly pos: Vector2;
}

export interface DecideSpawnsResult {
  readonly spawns: readonly EnemySpawnRequest[];
  readonly nextState: SpawnDirectorState;
  readonly nextRng: Rng;
}

function kindsAvailableAt(elapsedSeconds: number, tuning: SpawnTuning): EnemyKind[] {
  const kinds: EnemyKind[] = ["rusher"];
  if (elapsedSeconds >= tuning.shooterIntroducedAtSeconds) kinds.push("shooter");
  if (elapsedSeconds >= tuning.tankIntroducedAtSeconds) kinds.push("tank");
  return kinds;
}

/**
 * Pure. Spawn position is a fixed-radius ring around the player at a random
 * angle — never "just outside the camera edge", which would make spawn
 * density (and therefore difficulty) depend on viewport size.
 */
export function decideSpawns(
  state: SpawnDirectorState,
  elapsedSeconds: number,
  currentEnemyCount: number,
  playerPos: Vector2,
  tuning: SpawnTuning,
  rng: Rng,
): DecideSpawnsResult {
  if (elapsedSeconds < state.nextSpawnAt || currentEnemyCount >= tuning.maxAliveEnemies) {
    return { spawns: [], nextState: state, nextRng: rng };
  }

  const kinds = kindsAvailableAt(elapsedSeconds, tuning);
  const [kind, rngAfterPick] = pick(rng, kinds);
  const [angle, rngAfterAngle] = nextAngle(rngAfterPick);
  const pos = add(playerPos, fromAngle(angle, tuning.spawnRingRadius));

  return {
    spawns: [{ kind, pos }],
    nextState: { nextSpawnAt: elapsedSeconds + tuning.spawnIntervalAt(elapsedSeconds) },
    nextRng: rngAfterAngle,
  };
}
