// Three enemy kinds, escalating via the spawn director (spawn/spawn-director.ts)
// over the run rather than via more kinds. Each is a pure function of
// (self, playerPos, dt) -> what it wants to do this tick; nothing here
// mutates `self` — the caller writes `nextAttackCooldownRemaining` back onto
// the entity and applies `movement * dt` to its position.

import type { Vector2 } from "../types";
import { distance, normalize, scale, subtract } from "../vector";

export type EnemyKind = "rusher" | "shooter" | "tank";

export interface EnemyState {
  readonly id: string;
  readonly kind: EnemyKind;
  readonly pos: Vector2;
  readonly radius: number; // collision/hit-test size — also the visual "how big is the blob"
  readonly hp: number;
  readonly maxHp: number;
  /** Meaningful only for kinds that fire (Shooter); harmless dead weight
   * on Rusher/Tank, simpler than making it optional everywhere. */
  readonly attackCooldownRemaining: number;
}

export interface FiredProjectileRequest {
  readonly from: Vector2;
  readonly towards: Vector2; // the player's position at the moment of firing
}

export interface EnemyAiResult {
  readonly movement: Vector2; // world units/second; caller multiplies by dt
  readonly firedProjectile?: FiredProjectileRequest;
  readonly nextAttackCooldownRemaining: number;
}

// Placeholder tuning — see spawn/spawn-tuning.ts for the note this applies
// everywhere in this codebase: numbers here are guesses pending playtesting.
export const RUSHER_SPEED = 92;
export const RUSHER_MAX_HP = 6;

export const TANK_SPEED = 32;
export const TANK_MAX_HP = 40;

export const SHOOTER_SPEED = 42;
export const SHOOTER_MAX_HP = 12;
export const SHOOTER_PREFERRED_DISTANCE = 200;
export const SHOOTER_DISTANCE_TOLERANCE = 24;
export const SHOOTER_FIRE_COOLDOWN_SECONDS = 1.6;

function stepRusher(self: EnemyState, playerPos: Vector2): EnemyAiResult {
  const direction = normalize(subtract(playerPos, self.pos));
  return { movement: scale(direction, RUSHER_SPEED), nextAttackCooldownRemaining: 0 };
}

function stepTank(self: EnemyState, playerPos: Vector2): EnemyAiResult {
  const direction = normalize(subtract(playerPos, self.pos));
  return { movement: scale(direction, TANK_SPEED), nextAttackCooldownRemaining: 0 };
}

/** Holds a distance band rather than beelining — closes if too far, backs
 * off if too close, holds still and fires within the band. */
function stepShooter(self: EnemyState, playerPos: Vector2, dt: number): EnemyAiResult {
  const toPlayer = subtract(playerPos, self.pos);
  const dist = distance(playerPos, self.pos);
  const direction = normalize(toPlayer);

  let movement: Vector2;
  if (dist > SHOOTER_PREFERRED_DISTANCE + SHOOTER_DISTANCE_TOLERANCE) {
    movement = scale(direction, SHOOTER_SPEED);
  } else if (dist < SHOOTER_PREFERRED_DISTANCE - SHOOTER_DISTANCE_TOLERANCE) {
    movement = scale(direction, -SHOOTER_SPEED);
  } else {
    movement = { x: 0, y: 0 };
  }

  const cooldownRemaining = self.attackCooldownRemaining - dt;
  if (cooldownRemaining <= 0) {
    return {
      movement,
      firedProjectile: { from: self.pos, towards: playerPos },
      nextAttackCooldownRemaining: SHOOTER_FIRE_COOLDOWN_SECONDS,
    };
  }
  return { movement, nextAttackCooldownRemaining: cooldownRemaining };
}

export function stepEnemy(self: EnemyState, playerPos: Vector2, dt: number): EnemyAiResult {
  switch (self.kind) {
    case "rusher":
      return stepRusher(self, playerPos);
    case "tank":
      return stepTank(self, playerPos);
    case "shooter":
      return stepShooter(self, playerPos, dt);
  }
}

export function maxHpFor(kind: EnemyKind): number {
  switch (kind) {
    case "rusher":
      return RUSHER_MAX_HP;
    case "shooter":
      return SHOOTER_MAX_HP;
    case "tank":
      return TANK_MAX_HP;
  }
}

/** Small/plain, medium-with-a-tell, large-and-wide — the visual design's
 * silhouette sizing carried into the actual hit-test radius, not just the
 * drawing. */
export function radiusFor(kind: EnemyKind): number {
  switch (kind) {
    case "rusher":
      return 11;
    case "shooter":
      return 14;
    case "tank":
      return 22;
  }
}

export function contactDamageFor(kind: EnemyKind): number {
  switch (kind) {
    case "rusher":
      return 11;
    case "shooter":
      return 6;
    case "tank":
      return 28;
  }
}

export function findNearestEnemy(pos: Vector2, enemies: readonly EnemyState[]): EnemyState | null {
  let nearest: EnemyState | null = null;
  let nearestDistance = Infinity;
  for (const enemy of enemies) {
    const d = distance(pos, enemy.pos);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = enemy;
    }
  }
  return nearest;
}

export function spawnEnemy(id: string, kind: EnemyKind, pos: Vector2): EnemyState {
  return {
    id,
    kind,
    pos,
    radius: radiusFor(kind),
    hp: maxHpFor(kind),
    maxHp: maxHpFor(kind),
    attackCooldownRemaining: 0,
  };
}
