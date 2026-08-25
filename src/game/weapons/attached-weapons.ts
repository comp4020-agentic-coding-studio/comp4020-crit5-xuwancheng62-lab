// Every weapon that fires from the player's current position, rather than
// being a standalone entity (that's only Turret — see entities/placed-entities.ts).
// Blade and Beam resolve as an instant effect (see combat.ts) the moment they
// fire; Pistol/Scattergun/Rocket produce real traveling ProjectileSpawns.

import type { ProjectileSpawn } from "../entities/projectiles";
import type { Rng, Vector2 } from "../types";
import { nextRange } from "../rng";
import { angleOf, fromAngle, normalize, scale, subtract } from "../vector";
import { bladeStats, beamStats, pistolStats, rocketStats, scattergunStats } from "./weapon-stats";

export interface AreaEffect {
  readonly kind: "area";
  readonly center: Vector2;
  readonly radius: number;
  readonly damage: number;
}

export interface LineEffect {
  readonly kind: "line";
  readonly from: Vector2;
  readonly to: Vector2;
  readonly width: number;
  readonly damage: number;
}

export type InstantEffect = AreaEffect | LineEffect;

export function fireBlade(level: number, playerPos: Vector2): AreaEffect {
  const stats = bladeStats(level);
  return { kind: "area", center: playerPos, radius: stats.ringRadius, damage: stats.damage };
}

export function fireBeam(level: number, playerPos: Vector2, nearestEnemyPos: Vector2): LineEffect {
  const stats = beamStats(level);
  const direction = normalize(subtract(nearestEnemyPos, playerPos));
  const to = { x: playerPos.x + direction.x * stats.rangeDistance, y: playerPos.y + direction.y * stats.rangeDistance };
  return { kind: "line", from: playerPos, to, width: stats.width, damage: stats.damagePerHit };
}

export function firePistol(level: number, playerPos: Vector2, nearestEnemyPos: Vector2): ProjectileSpawn {
  const stats = pistolStats(level);
  const direction = normalize(subtract(nearestEnemyPos, playerPos));
  return {
    pos: playerPos,
    vel: scale(direction, stats.projectileSpeed),
    radius: stats.projectileRadius,
    damage: stats.damage,
    lifespanRemaining: 2,
  };
}

export function fireScattergun(
  level: number,
  playerPos: Vector2,
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
      pos: playerPos,
      vel: fromAngle(baseAngle + offset, stats.projectileSpeed),
      radius: stats.projectileRadius,
      damage: stats.damagePerPellet,
      lifespanRemaining: 1.2,
    });
  }
  return { spawns, nextRng: currentRng };
}

export function fireRocket(level: number, playerPos: Vector2, nearestEnemyPos: Vector2): ProjectileSpawn {
  const stats = rocketStats(level);
  const direction = normalize(subtract(nearestEnemyPos, playerPos));
  return {
    pos: playerPos,
    vel: scale(direction, stats.projectileSpeed),
    radius: stats.projectileRadius,
    damage: stats.damage,
    lifespanRemaining: 2.5,
    onImpact: "explode",
    explodeRadius: stats.explosionRadius,
    splashDamage: stats.splashDamage,
  };
}
