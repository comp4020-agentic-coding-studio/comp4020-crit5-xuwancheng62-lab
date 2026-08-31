import { describe, expect, it } from "vitest";
import { MAX_LEVEL } from "../src/game/weapons/loadout";
import { bladeStats, nukeStats, scattergunStats, smgStats, turretStats, WEAPON_KNOCKBACK_DISTANCE } from "../src/game/weapons/weapon-stats";

describe("scattergunStats: pellet count across the full 1..MAX_LEVEL range", () => {
  it("never falls through to the old level-4-and-beyond fallback value", () => {
    // Before MAX_LEVEL went from 4 to 8, level 5+ silently fell through to
    // a hardcoded `?? 5` — a lookup table sized for the old cap is exactly
    // the kind of thing a level-cap change silently breaks.
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      expect(scattergunStats(level).pelletCount).toBeGreaterThanOrEqual(3);
    }
  });

  it("pellet count never decreases as level rises", () => {
    let previous = 0;
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      const count = scattergunStats(level).pelletCount;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  it("MAX_LEVEL is actually 8, not still 4", () => {
    expect(MAX_LEVEL).toBe(8);
  });
});

describe("turretStats: sane numbers across the extended level range", () => {
  it("HP, damage and fire rate all keep improving from level 1 to MAX_LEVEL", () => {
    const low = turretStats(1);
    const high = turretStats(MAX_LEVEL);
    expect(high.maxHp).toBeGreaterThan(low.maxHp);
    expect(high.damage).toBeGreaterThan(low.damage);
    expect(high.attackCooldownSeconds).toBeLessThan(low.attackCooldownSeconds);
  });
});

describe("bladeStats: dedicated melee knockback", () => {
  it("has its own dedicated knockback, not the shared WEAPON_KNOCKBACK_DISTANCE other weapons use", () => {
    expect(bladeStats(1).knockback).toBeGreaterThan(WEAPON_KNOCKBACK_DISTANCE);
  });
});

describe("new ranged weapon tuning", () => {
  it("SMG fires much faster than the nuclear launcher", () => {
    expect(smgStats(1).cooldownSeconds).toBeLessThan(nukeStats(1).cooldownSeconds);
  });

  it("Nuke's base cooldown is four seconds", () => {
    expect(nukeStats(1).cooldownSeconds).toBe(4);
  });

  it("Nuke has a large, high-damage splash", () => {
    expect(nukeStats(1).explosionRadius).toBeGreaterThan(100);
    expect(nukeStats(1).splashDamage).toBeGreaterThan(50);
  });
});
