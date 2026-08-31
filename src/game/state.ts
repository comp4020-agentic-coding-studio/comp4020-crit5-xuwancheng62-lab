import { createRng } from "./rng";
import type { EntityId, Rng, Vector2 } from "./types";
import type { PlayerState } from "./entities/player";
import type { EnemyState } from "./entities/enemies";
import type { Projectile } from "./entities/projectiles";
import type { PlacedEntity } from "./entities/placed-entities";
import type { Pickup } from "./entities/pickups";
import type { BeamVisual } from "./weapons/attached-weapons";
import { INITIAL_LOADOUT, type Loadout, type WeaponId } from "./weapons/weapon-types";
import { INITIAL_XP_PROGRESS, type XpProgress } from "./leveling/xp";
import { statsAtCharacterLevel } from "./leveling/player-stats";
import { INITIAL_SPAWN_DIRECTOR_STATE, type SpawnDirectorState } from "./spawn/spawn-director";
import type { Ending } from "./win-loss";

export interface ExplosionEffect {
  readonly id: EntityId;
  readonly pos: Vector2;
  /** World units — matches the projectile's own explodeRadius so the visual
   * scales with the actual splash-damage area without changing it. */
  readonly radius: number;
  /** Absolute elapsedSeconds the effect started at; age it against the
   * current elapsedSeconds to fade/remove it. */
  readonly startedAt: number;
  readonly sourceWeapon: "rocket" | "nuke";
}

export interface GameState {
  readonly elapsedSeconds: number;
  readonly rng: Rng;
  readonly nextEntityId: number;
  readonly ending: Ending;

  readonly player: PlayerState;
  readonly loadout: Loadout;
  readonly xp: XpProgress;
  /** Total enemies killed this run. */
  readonly killCount: number;

  readonly enemies: readonly EnemyState[];
  readonly projectiles: readonly Projectile[];
  readonly placedEntities: readonly PlacedEntity[];
  readonly pickups: readonly Pickup[];
  /** One-shot visual effects (currently: an exploding projectile's splash),
   * purely cosmetic — nothing here is read by any damage/collision logic,
   * which already ran by the time one of these is created. See
   * explosionEffectDurationSeconds in step.ts for how long one lives. */
  readonly explosions: readonly ExplosionEffect[];

  readonly spawnDirector: SpawnDirectorState;

  /** Cooldown remaining per weapon type. A missing entry means "ready to
   * fire immediately" — which is what makes a just-picked-up weapon fire on
   * its very next opportunity rather than needing separate init-on-pickup
   * logic. */
  readonly weaponCooldowns: Readonly<Partial<Record<WeaponId, number>>>;
  readonly turretSpawnCooldownRemaining: number;

  /** The most recently fired Beam's locked visual line, or null before Beam
   * has ever fired. Set once, at the instant Beam fires (see step.ts); the
   * renderer draws this fixed geometry for the whole flash window instead of
   * recomputing direction/target from live state every frame. */
  readonly beamVisual: BeamVisual | null;

  /** Set true the one tick the Boss is spawned (elapsedSeconds >= 80, see
   * step.ts) and never cleared — this, not "is a boss currently in
   * `enemies`", is what lets win-loss.ts tell "never spawned" apart from
   * "spawned and already killed" after the Boss is removed from `enemies`
   * on death. */
  readonly bossSpawned: boolean;
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
    loadout: INITIAL_LOADOUT,
    xp: INITIAL_XP_PROGRESS,
    killCount: 0,
    enemies: [],
    projectiles: [],
    placedEntities: [],
    pickups: [],
    explosions: [],
    spawnDirector: INITIAL_SPAWN_DIRECTOR_STATE,
    weaponCooldowns: {},
    turretSpawnCooldownRemaining: 0,
    beamVisual: null,
    bossSpawned: false,
  };
}
