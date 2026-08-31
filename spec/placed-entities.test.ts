import { describe, expect, it } from "vitest";
import { spawnTurret, tickTurret, turretAimDirection } from "../src/game/entities/placed-entities";
import type { EnemyState } from "../src/game/entities/enemies";
import { turretStats } from "../src/game/weapons/weapon-stats";

function enemyAt(id: string, x: number, y: number): EnemyState {
  return { id, kind: "rusher", pos: { x, y }, radius: 11, hp: 20, maxHp: 20, attackCooldownRemaining: 0 };
}

describe("tickTurret: attacks multiple enemies at once, not just the nearest", () => {
  it("fires at every enemy in range simultaneously when there are several", () => {
    const turret = spawnTurret("t1", 1, { x: 0, y: 0 }, 0);
    const enemies = [enemyAt("a", 30, 0), enemyAt("b", -40, 0), enemyAt("c", 0, 50)];
    const result = tickTurret(turret, enemies, 0);
    expect(result.firedProjectiles).toHaveLength(3);
    const damage = turretStats(1).damage;
    for (const projectile of result.firedProjectiles!) {
      expect(projectile.damage).toBe(damage);
      expect(projectile.owner).toBe("player");
      expect(projectile.sourceWeapon).toBe("turret");
    }
  });

  it("caps at the nearest few when more enemies are in range than it can target at once", () => {
    const turret = spawnTurret("t1", 1, { x: 0, y: 0 }, 0);
    const range = turretStats(1).range;
    const enemies = Array.from({ length: 6 }, (_, i) => enemyAt(`e${i}`, 10 + i * 5, 0));
    const result = tickTurret(turret, enemies, 0);
    expect(result.firedProjectiles!.length).toBeGreaterThan(1);
    expect(result.firedProjectiles!.length).toBeLessThan(enemies.length);
    expect(range).toBeGreaterThan(0); // sanity: these enemies are indeed all in range
  });

  it("ignores anything out of range", () => {
    const turret = spawnTurret("t1", 1, { x: 0, y: 0 }, 0);
    const range = turretStats(1).range;
    const enemies = [enemyAt("near", 10, 0), enemyAt("far", range + 200, 0)];
    const result = tickTurret(turret, enemies, 0);
    expect(result.firedProjectiles).toHaveLength(1);
  });

  it("still fires nothing when nothing is in range", () => {
    const turret = spawnTurret("t1", 1, { x: 0, y: 0 }, 0);
    const range = turretStats(1).range;
    const result = tickTurret(turret, [enemyAt("far", range + 500, 0)], 0);
    expect(result.firedProjectiles).toBeUndefined();
  });

  it("respects its own cooldown even with multiple targets available", () => {
    const turret = { ...spawnTurret("t1", 1, { x: 0, y: 0 }, 0), attackCooldownRemaining: 1 };
    const result = tickTurret(turret, [enemyAt("a", 10, 0), enemyAt("b", -10, 0)], 1 / 60);
    expect(result.firedProjectiles).toBeUndefined();
    expect(result.turret.attackCooldownRemaining).toBeCloseTo(1 - 1 / 60);
  });

  it("its visual aim still points at only the single nearest target", () => {
    const turret = spawnTurret("t1", 1, { x: 0, y: 0 }, 0);
    const enemies = [enemyAt("far", 100, 0), enemyAt("near", 20, 0)];
    const direction = turretAimDirection(turret, enemies);
    expect(direction).toEqual({ x: 1, y: 0 }); // toward "near", not "far"
  });
});
