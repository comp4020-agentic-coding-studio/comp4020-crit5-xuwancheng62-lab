// Turret: the one weapon that is a standalone entity rather than an effect
// fired from the player. Spawned at a snapshot of the player's position, it
// then lives independently — its own HP, its own attack cooldown, its own
// targeting — until destroyed or expired.

import type { EnemyState } from "./enemies";
import type { ProjectileSpawn } from "./projectiles";
import type { EntityId, Vector2 } from "../types";
import { add, distance, normalize, scale, subtract } from "../vector";
import { turretStats, WEAPON_KNOCKBACK_DISTANCE } from "../weapons/weapon-stats";

export interface PlacedEntity {
  readonly id: EntityId;
  readonly kind: "turret";
  readonly pos: Vector2;
  readonly hp: number;
  readonly maxHp: number;
  readonly attackCooldownRemaining: number;
  readonly expiresAt: number; // absolute elapsedSeconds
  readonly level: number;
}

export function spawnTurret(id: EntityId, level: number, pos: Vector2, elapsedSeconds: number): PlacedEntity {
  const stats = turretStats(level);
  return {
    id,
    kind: "turret",
    pos,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    attackCooldownRemaining: 0,
    expiresAt: elapsedSeconds + stats.lifespanSeconds,
    level,
  };
}

export interface TurretTickResult {
  readonly turret: PlacedEntity;
  readonly firedProjectile?: ProjectileSpawn;
}

const TURRET_PROJECTILE_SPEED = 200;
const TURRET_PROJECTILE_RADIUS = 4;
const TURRET_PROJECTILE_LIFESPAN = 1.5;
/** World units the fired cannonball spawns ahead of the turret's own center,
 * along its aim direction — roughly where the barrel's muzzle sits, so the
 * shot doesn't appear to originate from inside the turret's base. Was 15;
 * bumped to match the larger rendered head (TURRET_HEAD_DIAMETER in
 * canvas-renderer.ts went from 22 to ~37, a ~1.7x increase) so the muzzle
 * point tracks the now-bigger barrel's actual visible tip. */
const TURRET_MUZZLE_FORWARD_DISTANCE = 25;

/** Pure: nearest enemy in range, or null if nothing to aim at. Shared by
 * tickTurret (the actual firing decision) and canvas-renderer.ts (the
 * turret's continuous visual aiming), so a turret's rendered barrel always
 * points exactly where it would actually fire — never a separately
 * maintained, potentially-out-of-sync direction. */
export function turretAimDirection(turret: PlacedEntity, enemies: readonly EnemyState[]): Vector2 | null {
  const stats = turretStats(turret.level);
  let nearest: EnemyState | null = null;
  let nearestDistance = Infinity;
  for (const enemy of enemies) {
    const d = distance(turret.pos, enemy.pos);
    if (d <= stats.range && d < nearestDistance) {
      nearestDistance = d;
      nearest = enemy;
    }
  }
  return nearest ? normalize(subtract(nearest.pos, turret.pos)) : null;
}

/** Pure: targets the nearest enemy in range, fires on its own cooldown. */
export function tickTurret(
  turret: PlacedEntity,
  enemies: readonly EnemyState[],
  dt: number,
): TurretTickResult {
  const stats = turretStats(turret.level);
  const direction = turretAimDirection(turret, enemies);

  const cooldownRemaining = Math.max(0, turret.attackCooldownRemaining - dt);
  if (direction && cooldownRemaining <= 0) {
    return {
      turret: { ...turret, attackCooldownRemaining: stats.attackCooldownSeconds },
      firedProjectile: {
        pos: add(turret.pos, scale(direction, TURRET_MUZZLE_FORWARD_DISTANCE)),
        vel: scale(direction, TURRET_PROJECTILE_SPEED),
        radius: TURRET_PROJECTILE_RADIUS,
        damage: stats.damage,
        lifespanRemaining: TURRET_PROJECTILE_LIFESPAN,
        owner: "player",
        knockback: WEAPON_KNOCKBACK_DISTANCE,
        sourceWeapon: "turret",
      },
    };
  }
  return { turret: { ...turret, attackCooldownRemaining: cooldownRemaining } };
}

export function isTurretAlive(turret: PlacedEntity, elapsedSeconds: number): boolean {
  return turret.hp > 0 && elapsedSeconds < turret.expiresAt;
}

export function damageTurret(turret: PlacedEntity, amount: number): PlacedEntity {
  return { ...turret, hp: Math.max(0, turret.hp - amount) };
}
