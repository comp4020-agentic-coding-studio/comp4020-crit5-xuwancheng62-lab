// Character leveling is a separate axis from weapon leveling: killing enemies
// grants XP (xp.ts), and crossing a threshold raises ALL SIX of these
// uniformly — no per-stat choice. This is what applies to every attack,
// including every held weapon
// (on top of that weapon's own 1..4 level from loadout.ts) — two independent
// multipliers, not one system standing in for the other.

import { statAt } from "../stat-curve";

export interface CharacterStats {
  moveSpeed: number;
  damageMultiplier: number;
  maxHealth: number;
  hpRegenPerSecond: number;
  lifestealFraction: number; // 0..1, fraction of damage dealt returned as healing
  attackSpeedMultiplier: number; // cooldowns are divided by this
}

export function statsAtCharacterLevel(level: number): CharacterStats {
  return {
    moveSpeed: statAt(level, 150, 4),
    damageMultiplier: statAt(level, 1, 0.08),
    maxHealth: statAt(level, 100, 12),
    hpRegenPerSecond: statAt(level, 0.4, 0.15),
    lifestealFraction: Math.min(0.3, statAt(level, 0, 0.015)),
    attackSpeedMultiplier: statAt(level, 1, 0.05),
  };
}

export function applyAttackSpeed(cooldownSeconds: number, stats: CharacterStats): number {
  return cooldownSeconds / stats.attackSpeedMultiplier;
}

export function applyDamage(baseDamage: number, stats: CharacterStats): number {
  return baseDamage * stats.damageMultiplier;
}
