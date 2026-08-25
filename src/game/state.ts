import { createRng } from "./rng";
import type { EntityId, Rng, Vector2 } from "./types";
import type { PlayerState } from "./entities/player";
import type { EnemyState } from "./entities/enemies";
import type { Projectile } from "./entities/projectiles";
import type { PlacedEntity } from "./entities/placed-entities";
import type { Pickup } from "./entities/pickups";
import { EMPTY_LOADOUT, type Loadout, type WeaponId } from "./weapons/weapon-types";
import { INITIAL_XP_PROGRESS, type XpProgress } from "./leveling/xp";
import { statsAtCharacterLevel } from "./leveling/player-stats";
import { INITIAL_SPAWN_DIRECTOR_STATE, type SpawnDirectorState } from "./spawn/spawn-director";
import type { Ending } from "./win-loss";

export interface GameState {
  readonly elapsedSeconds: number;
  readonly rng: Rng;
  readonly nextEntityId: number;
  readonly ending: Ending;

  readonly player: PlayerState;
  readonly loadout: Loadout;
  readonly xp: XpProgress;

  readonly enemies: readonly EnemyState[];
  readonly projectiles: readonly Projectile[];
  readonly placedEntities: readonly PlacedEntity[];
  readonly pickups: readonly Pickup[];

  readonly spawnDirector: SpawnDirectorState;

  /** Cooldown remaining per weapon type. A missing entry means "ready to
   * fire immediately" — which is what makes a just-picked-up weapon fire on
   * its very next opportunity rather than needing separate init-on-pickup
   * logic. */
  readonly weaponCooldowns: Readonly<Partial<Record<WeaponId, number>>>;
  readonly fistCooldownRemaining: number;
  readonly turretSpawnCooldownRemaining: number;
}

export function nextId(state: GameState, prefix: string): [EntityId, GameState] {
  return [`${prefix}${state.nextEntityId}`, { ...state, nextEntityId: state.nextEntityId + 1 }];
}

export function createInitialGameState(seed: number, playerStart: Vector2 = { x: 0, y: 0 }): GameState {
  const initialStats = statsAtCharacterLevel(INITIAL_XP_PROGRESS.level);
  return {
    elapsedSeconds: 0,
    rng: createRng(seed),
    nextEntityId: 0,
    ending: "playing",
    player: { pos: playerStart, hp: initialStats.maxHealth, contactInvulnerableRemaining: 0 },
    loadout: EMPTY_LOADOUT,
    xp: INITIAL_XP_PROGRESS,
    enemies: [],
    projectiles: [],
    placedEntities: [],
    pickups: [],
    spawnDirector: INITIAL_SPAWN_DIRECTOR_STATE,
    weaponCooldowns: {},
    fistCooldownRemaining: 0,
    turretSpawnCooldownRemaining: 0,
  };
}
