import { describe, expect, it } from "vitest";
import { applyAreaDamage, applyLineDamage, applyPointDamage } from "../src/game/combat";
import { BOSS_MAX_HP, BOSS_RADIUS, type EnemyState } from "../src/game/entities/enemies";

function enemyAt(x: number, y: number, hp = 20): EnemyState {
  return { id: "e", kind: "rusher", pos: { x, y }, radius: 11, hp, maxHp: 20, attackCooldownRemaining: 0 };
}

function bossAt(x: number, y: number, hp = BOSS_MAX_HP): EnemyState {
  return { id: "b", kind: "boss", pos: { x, y }, radius: BOSS_RADIUS, hp, maxHp: BOSS_MAX_HP, attackCooldownRemaining: 0 };
}

function chargingTankAt(x: number, y: number, hp = 40): EnemyState {
  return {
    id: "t",
    kind: "tank",
    pos: { x, y },
    radius: 22,
    hp,
    maxHp: 40,
    attackCooldownRemaining: 0,
    chargePhase: "charging",
    chargeTimer: 0.3,
    chargeDirection: { x: 1, y: 0 },
  };
}

describe("applyAreaDamage: knockback (Blade and explosive splash)", () => {
  it("pushes a surviving hit directly away from the effect's center", () => {
    const enemy = enemyAt(10, 0); // 10 units to the right of center
    const result = applyAreaDamage([enemy], { x: 0, y: 0 }, 30, 1, 60);
    expect(result.survivors[0].pos.x).toBeCloseTo(70); // 10 + 60, further along the same ray
    expect(result.survivors[0].pos.y).toBeCloseTo(0);
  });

  it("does not move anything when knockback is omitted", () => {
    const enemy = enemyAt(10, 0);
    const result = applyAreaDamage([enemy], { x: 0, y: 0 }, 30, 1);
    expect(result.survivors[0].pos).toEqual({ x: 10, y: 0 });
  });

  it("never knocks back a hit that kills — there's no survivor left to move", () => {
    const enemy = enemyAt(10, 0, 1);
    const result = applyAreaDamage([enemy], { x: 0, y: 0 }, 30, 5, 60);
    expect(result.killed).toHaveLength(1);
    expect(result.survivors).toHaveLength(0);
  });
});

describe("applyPointDamage: knockback (SMG, Scattergun, Rocket, Nuke, Turret)", () => {
  it("pushes a surviving hit further along the projectile's own travel direction", () => {
    const enemy = enemyAt(100, 0, 20);
    const result = applyPointDamage(enemy, 1, { direction: { x: 1, y: 0 }, distance: 40 });
    expect(result.pos).toEqual({ x: 140, y: 0 });
  });

  it("does not move anything when knockback is omitted (enemy fire never knocks back)", () => {
    const enemy = enemyAt(100, 0, 20);
    const result = applyPointDamage(enemy, 1);
    expect(result.pos).toEqual({ x: 100, y: 0 });
  });

  it("never knocks back a hit that kills", () => {
    const enemy = enemyAt(100, 0, 1);
    const result = applyPointDamage(enemy, 5, { direction: { x: 1, y: 0 }, distance: 40 });
    expect(result.hp).toBe(0);
    expect(result.pos).toEqual({ x: 100, y: 0 });
  });
});

describe("applyLineDamage: Beam never knocks anything back", () => {
  it("has no knockback parameter at all — a hit enemy's position is untouched", () => {
    const enemy = enemyAt(50, 0, 20);
    const result = applyLineDamage([enemy], { x: 0, y: 0 }, { x: 100, y: 0 }, 10, 1);
    expect(result.survivors[0].pos).toEqual({ x: 50, y: 0 });
  });
});

describe("super armor: a charging Tank still takes damage but never gets displaced", () => {
  it("applyAreaDamage: charging Tank's hp drops but its position is untouched", () => {
    const tank = chargingTankAt(10, 0);
    const result = applyAreaDamage([tank], { x: 0, y: 0 }, 30, 5, 60);
    expect(result.survivors[0].hp).toBe(35);
    expect(result.survivors[0].pos).toEqual({ x: 10, y: 0 });
  });

  it("applyAreaDamage: a non-charging (approaching) Tank is knocked back normally, for contrast", () => {
    const approaching: EnemyState = { ...chargingTankAt(10, 0), chargePhase: "approaching" };
    const result = applyAreaDamage([approaching], { x: 0, y: 0 }, 30, 5, 60);
    expect(result.survivors[0].pos.x).toBeCloseTo(70);
  });

  it("applyAreaDamage: a Tank mid-windup still gets knocked back — super armor is charging-only", () => {
    const windingUp: EnemyState = { ...chargingTankAt(10, 0), chargePhase: "windup" };
    const result = applyAreaDamage([windingUp], { x: 0, y: 0 }, 30, 5, 60);
    expect(result.survivors[0].pos.x).toBeCloseTo(70);
  });

  it("applyPointDamage: charging Tank's hp drops but its position is untouched", () => {
    const tank = chargingTankAt(100, 0);
    const result = applyPointDamage(tank, 5, { direction: { x: 1, y: 0 }, distance: 40 });
    expect(result.hp).toBe(35);
    expect(result.pos).toEqual({ x: 100, y: 0 });
  });

  it("applyPointDamage: a killing hit on a charging Tank still applies (super armor blocks displacement, not death)", () => {
    const tank = chargingTankAt(100, 0, 3);
    const result = applyPointDamage(tank, 5, { direction: { x: 1, y: 0 }, distance: 40 });
    expect(result.hp).toBe(0);
  });
});

describe("Boss knockback resistance: strongly resisted, not immune", () => {
  it("applyAreaDamage: takes full damage but is displaced far less than a normal enemy under the same hit", () => {
    const boss = bossAt(10, 0);
    const rusher = enemyAt(10, 0);
    const bossResult = applyAreaDamage([boss], { x: 0, y: 0 }, 30, 5, 60);
    const rusherResult = applyAreaDamage([rusher], { x: 0, y: 0 }, 30, 5, 60);
    expect(bossResult.survivors[0].hp).toBe(BOSS_MAX_HP - 5); // damage unaffected
    const bossDisplacement = bossResult.survivors[0].pos.x - 10;
    const rusherDisplacement = rusherResult.survivors[0].pos.x - 10;
    expect(bossDisplacement).toBeGreaterThan(0); // not fully immune...
    expect(bossDisplacement).toBeLessThan(rusherDisplacement * 0.2); // ...but strongly resisted
  });

  it("applyPointDamage: takes full damage but is displaced far less than a normal enemy under the same hit", () => {
    const boss = bossAt(100, 0);
    const rusher = enemyAt(100, 0);
    const knockback = { direction: { x: 1, y: 0 }, distance: 40 };
    const bossResult = applyPointDamage(boss, 5, knockback);
    const rusherResult = applyPointDamage(rusher, 5, knockback);
    expect(bossResult.hp).toBe(BOSS_MAX_HP - 5);
    const bossDisplacement = bossResult.pos.x - 100;
    const rusherDisplacement = rusherResult.pos.x - 100;
    expect(bossDisplacement).toBeGreaterThan(0);
    expect(bossDisplacement).toBeLessThan(rusherDisplacement * 0.2);
  });

  it("a killing hit on the Boss still applies, resistance or not", () => {
    const boss = bossAt(100, 0, 3);
    const result = applyPointDamage(boss, 5, { direction: { x: 1, y: 0 }, distance: 40 });
    expect(result.hp).toBe(0);
  });
});
