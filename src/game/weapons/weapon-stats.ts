// Every per-weapon, per-level number lives here, nowhere else — this is what
// playtesting will edit most, and the reason it's all in one place rather
// than scattered through attached-weapons.ts/placed-weapons.ts. Every base
// value is a placeholder: pacing is discovered by playing (or by
// scripts/simulate-runs.ts as a cheap pre-check), never reasoned out in the
// abstract. Level is always 1..MAX_LEVEL from loadout.ts, except Fist, which
// never levels via pickup at all.

import { statAt } from "../stat-curve";

export interface BladeStats {
  damage: number;
  cooldownSeconds: number;
  ringRadius: number;
}
export function bladeStats(level: number): BladeStats {
  return {
    damage: statAt(level, 6, 2),
    cooldownSeconds: statAt(level, 0.6, -0.08),
    ringRadius: statAt(level, 42, 4),
  };
}

export interface PistolStats {
  damage: number;
  cooldownSeconds: number;
  projectileSpeed: number;
  projectileRadius: number;
}
export function pistolStats(level: number): PistolStats {
  return {
    damage: statAt(level, 5, 2),
    cooldownSeconds: statAt(level, 0.7, -0.1),
    projectileSpeed: statAt(level, 260, 15),
    projectileRadius: 5,
  };
}

const SCATTERGUN_PELLET_COUNTS = [3, 4, 4, 5] as const; // index = level - 1

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
    pelletCount: SCATTERGUN_PELLET_COUNTS[level - 1] ?? 5,
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
/** Fixed run-wide cap on simultaneously-alive turrets — NOT parameterized by
 * any one turret's level, per the design: leveling makes each turret better,
 * not how many can exist at once. */
export const TURRET_CONCURRENT_CAP = 2;

export interface FistStats {
  damage: number;
  cooldownSeconds: number;
  range: number;
}
/** Fist never levels via pickup — it only scales with the character's own
 * level (see leveling/player-stats.ts), so this returns a fixed baseline. */
export function fistBaseStats(): FistStats {
  return { damage: 2, cooldownSeconds: 0.5, range: 34 };
}
