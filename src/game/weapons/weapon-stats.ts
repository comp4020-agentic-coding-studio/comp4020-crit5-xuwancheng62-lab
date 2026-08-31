// Every per-weapon, per-level number lives here, nowhere else — this is what
// playtesting will edit most, and the reason it's all in one place rather
// than scattered through attached-weapons.ts/placed-weapons.ts. Every base
// value is a placeholder: pacing is discovered by playing (or by
// scripts/simulate-runs.ts as a cheap pre-check), never reasoned out in the
// abstract. Level is always 1..MAX_LEVEL from loadout.ts.

import { statAt } from "../stat-curve";
import { MAX_LEVEL } from "./loadout";

/** Shared knockback distance for every ordinary weapon hit except Beam. */
export const WEAPON_KNOCKBACK_DISTANCE = 50;

export interface BladeStats {
  damage: number;
  cooldownSeconds: number;
  ringRadius: number;
  /** Blade's own dedicated knockback — stronger than the shared value. */
  knockback: number;
}
export function bladeStats(level: number): BladeStats {
  return {
    damage: statAt(level, 11, 3),
    cooldownSeconds: statAt(level, 0.6, -0.08),
    ringRadius: statAt(level, 65, 6),
    knockback: 90,
  };
}

export interface SmgStats {
  damage: number;
  cooldownSeconds: number;
  projectileSpeed: number;
  projectileRadius: number;
}
export function smgStats(level: number): SmgStats {
  return {
    damage: statAt(level, 3, 1),
    cooldownSeconds: statAt(level, 0.32, -0.025),
    projectileSpeed: statAt(level, 280, 15),
    projectileRadius: 4,
  };
}

const SCATTERGUN_PELLET_COUNTS = [3, 4, 4, 5, 5, 6, 6, 7] as const; // index = level - 1

export interface ScattergunStats {
  pelletCount: number;
  damagePerPellet: number;
  cooldownSeconds: number;
  projectileSpeed: number;
  projectileRadius: number;
  spreadRadians: number;
}
export function scattergunStats(level: number): ScattergunStats {
  return {
    pelletCount: SCATTERGUN_PELLET_COUNTS[level - 1] ?? 7,
    damagePerPellet: statAt(level, 3, 1),
    cooldownSeconds: statAt(level, 0.9, -0.08),
    projectileSpeed: 220,
    projectileRadius: 4,
    spreadRadians: Math.PI / 6,
  };
}

export interface BeamStats {
  /** Dealt once to every enemy the line touches, each time it fires — not a
   * continuous tick, since the beam is an instant line-hit gated by its own
   * cooldown, not a persisting hitbox. */
  damagePerHit: number;
  cooldownSeconds: number;
  width: number;
  rangeDistance: number;
}
export function beamStats(level: number): BeamStats {
  return {
    damagePerHit: statAt(level, 8, 3),
    cooldownSeconds: statAt(level, 1.2, -0.15),
    width: statAt(level, 6, 2),
    rangeDistance: statAt(level, 220, 20),
  };
}

export interface RocketStats {
  damage: number;
  cooldownSeconds: number;
  projectileSpeed: number;
  projectileRadius: number;
  explosionRadius: number;
  splashDamage: number;
}
export function rocketStats(level: number): RocketStats {
  return {
    damage: statAt(level, 9, 3),
    cooldownSeconds: statAt(level, 1.4, -0.15),
    projectileSpeed: 180,
    projectileRadius: 6,
    explosionRadius: statAt(level, 36, 8),
    splashDamage: statAt(level, 6, 3),
  };
}

export interface NukeStats {
  damage: number;
  cooldownSeconds: number;
  projectileSpeed: number;
  projectileRadius: number;
  explosionRadius: number;
  splashDamage: number;
  knockback: number;
}
export function nukeStats(level: number): NukeStats {
  return {
    damage: statAt(level, 20, 5),
    // Linear 6s -> 2s curve across all eight weapon levels.
    cooldownSeconds: statAt(level, 6, (2 - 6) / (MAX_LEVEL - 1)),
    projectileSpeed: 110,
    projectileRadius: 8,
    explosionRadius: statAt(level, 120, 10),
    splashDamage: statAt(level, 90, 18),
    knockback: 120,
  };
}

export interface TurretStats {
  maxHp: number;
  damage: number;
  attackCooldownSeconds: number;
  range: number;
  lifespanSeconds: number;
  spawnCooldownSeconds: number;
}
export function turretStats(level: number): TurretStats {
  return {
    maxHp: statAt(level, 20, 8),
    damage: statAt(level, 4, 2),
    attackCooldownSeconds: statAt(level, 0.8, -0.08),
    range: 130,
    lifespanSeconds: statAt(level, 8, 2),
    spawnCooldownSeconds: 6,
  };
}
