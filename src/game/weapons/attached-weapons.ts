// Every weapon that fires from the player's current position, rather than
// being a standalone entity (that's only Turret — see entities/placed-entities.ts).
// Blade and Beam resolve as an instant effect (see combat.ts) the moment they
// fire; Pistol/Scattergun/Rocket produce real traveling ProjectileSpawns.

import type { ProjectileSpawn } from "../entities/projectiles";
import type { Rng, Vector2 } from "../types";
import { nextRange } from "../rng";
import { angleOf, fromAngle, normalize, scale, subtract } from "../vector";
import {
  bladeStats,
  beamStats,
  pistolStats,
  rocketStats,
  scattergunStats,
  WEAPON_KNOCKBACK_DISTANCE,
} from "./weapon-stats";

export interface AreaEffect {
  readonly kind: "area";
  readonly center: Vector2;
  readonly radius: number;
  readonly damage: number;
  /** Fist and Blade set this (each with its own dedicated value); a
   * Rocket's splash uses the shared WEAPON_KNOCKBACK_DISTANCE instead. */
  readonly knockback?: number;
}

export interface LineEffect {
  readonly kind: "line";
  readonly from: Vector2;
  readonly to: Vector2;
  readonly width: number;
  readonly damage: number;
}

export type InstantEffect = AreaEffect | LineEffect;

/** Beam's rendered line only — see fireBeamVisual for why this is separate
 * from the damage-dealing LineEffect above. */
export interface BeamVisual {
  readonly from: Vector2;
  readonly to: Vector2;
  readonly width: number;
}

export function fireBlade(level: number, playerPos: Vector2): AreaEffect {
  const stats = bladeStats(level);
  return {
    kind: "area",
    center: playerPos,
    radius: stats.ringRadius,
    damage: stats.damage,
    knockback: stats.knockback,
  };
}

export function fireBeam(level: number, playerPos: Vector2, nearestEnemyPos: Vector2): LineEffect {
  const stats = beamStats(level);
  const direction = normalize(subtract(nearestEnemyPos, playerPos));
  const to = { x: playerPos.x + direction.x * stats.rangeDistance, y: playerPos.y + direction.y * stats.rangeDistance };
  return { kind: "line", from: playerPos, to, width: stats.width, damage: stats.damagePerHit };
}

/** The Beam's VISUAL line, computed once at the exact instant it fires and
 * stored on GameState (see step.ts) so the renderer draws this same fixed
 * geometry for the whole flash instead of recomputing direction/target every
 * frame from whatever the player/nearest-enemy happen to be at render time.
 * Deliberately a separate value from fireBeam's own LineEffect above: the
 * damage hitbox stays anchored to the player's own center (unchanged
 * balance/range), while this one starts at the weapon's visible muzzle tip
 * so the drawn beam reads as coming from the gun, not from thin air at the
 * player's center. Same aim direction as fireBeam (nearest enemy from the
 * player), just a different origin point. */
export function fireBeamVisual(
  level: number,
  playerPos: Vector2,
  muzzlePos: Vector2,
  nearestEnemyPos: Vector2,
): BeamVisual {
  const stats = beamStats(level);
  const direction = normalize(subtract(nearestEnemyPos, playerPos));
  const to = { x: muzzlePos.x + direction.x * stats.rangeDistance, y: muzzlePos.y + direction.y * stats.rangeDistance };
  return { from: muzzlePos, to, width: stats.width };
}

/** `muzzlePos` only ever shifts where the projectile visually spawns from
 * (the orbiting weapon icon's barrel tip — see weapon-orbit.ts); the flight
 * direction is still computed from the player's actual center to the
 * target, so aim, range and damage are exactly what they were before this
 * was introduced. */
export function firePistol(level: number, playerPos: Vector2, muzzlePos: Vector2, nearestEnemyPos: Vector2): ProjectileSpawn {
  const stats = pistolStats(level);
  const direction = normalize(subtract(nearestEnemyPos, playerPos));
  return {
    pos: muzzlePos,
    vel: scale(direction, stats.projectileSpeed),
    radius: stats.projectileRadius,
    damage: stats.damage,
    lifespanRemaining: 2,
    owner: "player",
    knockback: WEAPON_KNOCKBACK_DISTANCE,
    sourceWeapon: "pistol",
  };
}

export function fireScattergun(
  level: number,
  playerPos: Vector2,
  muzzlePos: Vector2,
  nearestEnemyPos: Vector2,
  rng: Rng,
): { spawns: ProjectileSpawn[]; nextRng: Rng } {
  const stats = scattergunStats(level);
  const baseAngle = angleOf(normalize(subtract(nearestEnemyPos, playerPos)));
  const spawns: ProjectileSpawn[] = [];
  let currentRng = rng;
  for (let i = 0; i < stats.pelletCount; i += 1) {
    const [offset, nextRng] = nextRange(currentRng, -stats.spreadRadians / 2, stats.spreadRadians / 2);
    currentRng = nextRng;
    spawns.push({
      pos: muzzlePos,
      vel: fromAngle(baseAngle + offset, stats.projectileSpeed),
      radius: stats.projectileRadius,
      damage: stats.damagePerPellet,
      lifespanRemaining: 1.2,
      owner: "player",
      knockback: WEAPON_KNOCKBACK_DISTANCE,
      sourceWeapon: "scattergun",
    });
  }
  return { spawns, nextRng: currentRng };
}

export function fireRocket(level: number, playerPos: Vector2, muzzlePos: Vector2, nearestEnemyPos: Vector2): ProjectileSpawn {
  const stats = rocketStats(level);
  const direction = normalize(subtract(nearestEnemyPos, playerPos));
  return {
    pos: muzzlePos,
    vel: scale(direction, stats.projectileSpeed),
    radius: stats.projectileRadius,
    damage: stats.damage,
    lifespanRemaining: 2.5,
    onImpact: "explode",
    explodeRadius: stats.explosionRadius,
    splashDamage: stats.splashDamage,
    owner: "player",
    knockback: WEAPON_KNOCKBACK_DISTANCE,
    sourceWeapon: "rocket",
  };
}
