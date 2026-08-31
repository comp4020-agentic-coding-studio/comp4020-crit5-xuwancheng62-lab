// SMG, Scattergun, Rocket and Nuke become real traveling Projectiles.
// Blade and Beam are resolved as an instant area/line hit the moment
// their cooldown fires (see combat.ts) — they never persist across frames,
// which sidesteps the bookkeeping a "piercing hitbox that lives for 0.2s at
// 60fps" would need to avoid hitting the same enemy over and over in that
// window. A traveling projectile has no such problem: it's consumed on its
// first hit.

import type { EntityId, Vector2 } from "../types";
import { add, scale } from "../vector";
import type { WeaponId } from "../weapons/weapon-types";

export interface ProjectileSpawn {
  readonly pos: Vector2;
  readonly vel: Vector2;
  readonly radius: number;
  readonly damage: number;
  readonly lifespanRemaining: number;
  readonly onImpact?: "explode";
  readonly explodeOnExpiry?: boolean;
  readonly explodeRadius?: number;
  readonly splashDamage?: number;
  /** Which weapon fired this — purely descriptive, read only by the renderer
   * to pick a sprite (canvas-renderer.ts). Never consulted by any collision
   * or damage logic here, so it can't affect gameplay. Absent for enemy fire,
   * which keeps its own generic look. */
  readonly sourceWeapon?: WeaponId;
  /** "player" (attached weapons + Turret) can only hit enemies; "enemy"
   * (Shooter's shot) can only hit the player. Without this, an enemy's own
   * bullet — spawned at its own position — immediately overlaps the enemy
   * that fired it and kills it on the spot. */
  readonly owner: "player" | "enemy";
  /** Distance a surviving hit is shoved along this projectile's travel
   * direction. Only player-owned projectiles set it — Shooter's shot never
   * knocks the player back. */
  readonly knockback?: number;
}

export interface Projectile extends ProjectileSpawn {
  readonly id: EntityId;
}

export function instantiateProjectiles(
  spawns: readonly ProjectileSpawn[],
  nextId: number,
): { projectiles: Projectile[]; nextId: number } {
  const projectiles = spawns.map((spawn, i) => ({ ...spawn, id: `p${nextId + i}` }));
  return { projectiles, nextId: nextId + spawns.length };
}

export function moveProjectile(projectile: Projectile, dt: number): Projectile {
  return {
    ...projectile,
    pos: add(projectile.pos, scale(projectile.vel, dt)),
    lifespanRemaining: projectile.lifespanRemaining - dt,
  };
}

export function isExpired(projectile: Projectile): boolean {
  return projectile.lifespanRemaining <= 0;
}
