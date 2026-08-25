// Turret: the one weapon that is a standalone entity rather than an effect
// fired from the player. Spawned at a snapshot of the player's position, it
// then lives independently — its own HP, its own attack cooldown, its own
// targeting — until destroyed or expired.

import type { EnemyState } from "./enemies";
import type { ProjectileSpawn } from "./projectiles";
import type { EntityId, Vector2 } from "../types";
import { distance, normalize, scale, subtract } from "../vector";
import { turretStats } from "../weapons/weapon-stats";

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

/** Pure: targets the nearest enemy in range, fires on its own cooldown. */
export function tickTurret(
  turret: PlacedEntity,
  enemies: readonly EnemyState[],
  dt: number,
): TurretTickResult {
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

  const cooldownRemaining = Math.max(0, turret.attackCooldownRemaining - dt);
  if (nearest && cooldownRemaining <= 0) {
    const direction = normalize(subtract(nearest.pos, turret.pos));
    return {
      turret: { ...turret, attackCooldownRemaining: stats.attackCooldownSeconds },
      firedProjectile: {
        pos: turret.pos,
        vel: scale(direction, TURRET_PROJECTILE_SPEED),
        radius: TURRET_PROJECTILE_RADIUS,
        damage: stats.damage,
        lifespanRemaining: TURRET_PROJECTILE_LIFESPAN,
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
