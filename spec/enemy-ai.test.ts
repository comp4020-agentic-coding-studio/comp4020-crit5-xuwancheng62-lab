import { describe, expect, it } from "vitest";
import {
  RUSHER_SPEED,
  SHOOTER_DISTANCE_TOLERANCE,
  SHOOTER_FIRE_COOLDOWN_SECONDS,
  SHOOTER_PREFERRED_DISTANCE,
  SHOOTER_SPEED,
  TANK_SPEED,
  type EnemyState,
  stepEnemy,
} from "../src/game/entities/enemies";
import { length, normalize, subtract } from "../src/game/vector";

const PLAYER_POS = { x: 0, y: 0 };

function enemyAt(kind: EnemyState["kind"], pos: EnemyState["pos"], attackCooldownRemaining = 0): EnemyState {
  return { id: "e1", kind, pos, hp: 10, maxHp: 10, attackCooldownRemaining };
}

describe("stepRusher", () => {
  it("moves straight toward the player at RUSHER_SPEED", () => {
    const self = enemyAt("rusher", { x: 100, y: 0 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.movement.x).toBeCloseTo(-RUSHER_SPEED);
    expect(result.movement.y).toBeCloseTo(0);
  });

  it("never fires", () => {
    const self = enemyAt("rusher", { x: 100, y: 0 });
    expect(stepEnemy(self, PLAYER_POS, 1 / 60).firedProjectile).toBeUndefined();
  });
});

describe("stepTank", () => {
  it("moves straight toward the player, slower than Rusher", () => {
    const self = enemyAt("tank", { x: 0, y: 100 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(length(result.movement)).toBeCloseTo(TANK_SPEED);
    expect(TANK_SPEED).toBeLessThan(RUSHER_SPEED);
  });
});

describe("stepShooter", () => {
  it("closes distance when farther than its preferred band", () => {
    const farPos = { x: SHOOTER_PREFERRED_DISTANCE + 100, y: 0 };
    const self = enemyAt("shooter", farPos);
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    const towardPlayer = normalize(subtract(PLAYER_POS, farPos));
    expect(result.movement.x).toBeCloseTo(towardPlayer.x * SHOOTER_SPEED);
  });

  it("backs away when closer than its preferred band", () => {
    const closePos = { x: SHOOTER_PREFERRED_DISTANCE - 100, y: 0 };
    const self = enemyAt("shooter", closePos);
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    // Should move AWAY from the player (positive x, since player is at x=0
    // and the enemy is on the positive side).
    expect(result.movement.x).toBeGreaterThan(0);
  });

  it("holds still within the preferred distance band", () => {
    const bandPos = { x: SHOOTER_PREFERRED_DISTANCE, y: 0 };
    const self = enemyAt("shooter", bandPos);
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.movement.x).toBeCloseTo(0);
    expect(result.movement.y).toBeCloseTo(0);
  });

  it("does not fire while its cooldown is still running", () => {
    const self = enemyAt("shooter", { x: SHOOTER_PREFERRED_DISTANCE, y: 0 }, 1.0);
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.firedProjectile).toBeUndefined();
    expect(result.nextAttackCooldownRemaining).toBeCloseTo(1.0 - 1 / 60);
  });

  it("fires and resets its cooldown once it reaches zero", () => {
    const self = enemyAt("shooter", { x: SHOOTER_PREFERRED_DISTANCE, y: 0 }, 0.001);
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.firedProjectile).toEqual({
      from: { x: SHOOTER_PREFERRED_DISTANCE, y: 0 },
      towards: PLAYER_POS,
    });
    expect(result.nextAttackCooldownRemaining).toBe(SHOOTER_FIRE_COOLDOWN_SECONDS);
  });

  it("respects its distance tolerance band, not a single exact distance", () => {
    const justInsideBand = enemyAt("shooter", {
      x: SHOOTER_PREFERRED_DISTANCE + SHOOTER_DISTANCE_TOLERANCE - 1,
      y: 0,
    });
    expect(stepEnemy(justInsideBand, PLAYER_POS, 1 / 60).movement).toEqual({ x: 0, y: 0 });
  });
});
