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
  /** One entry per enemy actually hit this attack — see
   * TURRET_MAX_SIMULTANEOUS_TARGETS below for how many that can be. */
  readonly firedProjectiles?: readonly ProjectileSpawn[];
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
/** A turret now fires at more than one enemy per attack — up to this many of
 * the nearest ones in range, simultaneously, rather than only the single
 * nearest. Flat per-turret cap, not level-scaled: level already controls how
 * many turrets get deployed at once (spawnTurret's caller in step.ts), so
 * this is a separate, deliberately modest multiplier on top of that. */
const TURRET_MAX_SIMULTANEOUS_TARGETS = 3;

/** Pure: the nearest `maxTargets` enemies in range, nearest first, or an
 * empty array if nothing's in range. Shared by tickTurret (the actual
 * firing decision) and turretAimDirection (the turret's single visual aim,
 * always the nearest of these). */
export function turretTargetsInRange(
  turret: PlacedEntity,
  enemies: readonly EnemyState[],
  maxTargets: number,
): EnemyState[] {
  const stats = turretStats(turret.level);
  return enemies
    .map((enemy) => ({ enemy, d: distance(turret.pos, enemy.pos) }))
    .filter(({ d }) => d <= stats.range)
    .sort((a, b) => a.d - b.d)
    .slice(0, maxTargets)
    .map(({ enemy }) => enemy);
}

/** Pure: direction to the single nearest enemy in range, or null if nothing
 * to aim at. Used only for the turret's own visual barrel rotation
 * (canvas-renderer.ts) — one barrel can only point one way, even though
 * tickTurret below can now damage several targets in the same attack. */
export function turretAimDirection(turret: PlacedEntity, enemies: readonly EnemyState[]): Vector2 | null {
  const [nearest] = turretTargetsInRange(turret, enemies, 1);
  return nearest ? normalize(subtract(nearest.pos, turret.pos)) : null;
}

/** Pure: targets up to TURRET_MAX_SIMULTANEOUS_TARGETS nearest enemies in
 * range, firing one projectile at each, simultaneously, on its own
 * cooldown. */
export function tickTurret(
  turret: PlacedEntity,
  enemies: readonly EnemyState[],
  dt: number,
): TurretTickResult {
  const stats = turretStats(turret.level);
  const targets = turretTargetsInRange(turret, enemies, TURRET_MAX_SIMULTANEOUS_TARGETS);

  const cooldownRemaining = Math.max(0, turret.attackCooldownRemaining - dt);
  if (targets.length > 0 && cooldownRemaining <= 0) {
    const firedProjectiles = targets.map((target) => {
      const direction = normalize(subtract(target.pos, turret.pos));
      return {
        pos: add(turret.pos, scale(direction, TURRET_MUZZLE_FORWARD_DISTANCE)),
        vel: scale(direction, TURRET_PROJECTILE_SPEED),
        radius: TURRET_PROJECTILE_RADIUS,
        damage: stats.damage,
        lifespanRemaining: TURRET_PROJECTILE_LIFESPAN,
        owner: "player" as const,
        knockback: WEAPON_KNOCKBACK_DISTANCE,
        sourceWeapon: "turret" as const,
      };
    });
    return { turret: { ...turret, attackCooldownRemaining: stats.attackCooldownSeconds }, firedProjectiles };
  }
  return { turret: { ...turret, attackCooldownRemaining: cooldownRemaining } };
}

export function isTurretAlive(turret: PlacedEntity, elapsedSeconds: number): boolean {
  return turret.hp > 0 && elapsedSeconds < turret.expiresAt;
}

export function damageTurret(turret: PlacedEntity, amount: number): PlacedEntity {
  return { ...turret, hp: Math.max(0, turret.hp - amount) };
}
