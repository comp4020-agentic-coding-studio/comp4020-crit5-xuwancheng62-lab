import { describe, expect, it } from "vitest";
import {
  BOSS_ATTACK_COOLDOWN_SECONDS,
  BOSS_ATTACK_WARNING_SECONDS,
  BOSS_NORMAL_ATTACK_FAN_RADIANS,
  BOSS_NORMAL_ATTACK_PROJECTILE_COUNT,
  BOSS_NORMAL_ATTACKS_BEFORE_SPECIAL,
  BOSS_SPECIAL_ATTACK_PROJECTILE_COUNT,
  BOSS_SPEED,
  RUSHER_SPEED,
  SHOOTER_DISTANCE_TOLERANCE,
  SHOOTER_FIRE_COOLDOWN_SECONDS,
  SHOOTER_PREFERRED_DISTANCE,
  SHOOTER_SPEED,
  TANK_CHARGE_COOLDOWN_SECONDS,
  TANK_CHARGE_DURATION_SECONDS,
  TANK_CHARGE_SPEED,
  TANK_CHARGE_TRIGGER_RANGE,
  TANK_SPEED,
  TANK_WINDUP_SECONDS,
  type EnemyState,
  stepEnemy,
} from "../src/game/entities/enemies";
import { angleOf, length, normalize, subtract } from "../src/game/vector";

const PLAYER_POS = { x: 0, y: 0 };

function enemyAt(kind: EnemyState["kind"], pos: EnemyState["pos"], attackCooldownRemaining = 0): EnemyState {
  return { id: "e1", kind, pos, radius: 12, hp: 10, maxHp: 10, attackCooldownRemaining };
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

describe("stepTank: approaching (outside charge range)", () => {
  it("moves straight toward the player, slower than Rusher", () => {
    // Placed beyond TANK_CHARGE_TRIGGER_RANGE so this exercises plain
    // approach behavior, not the charge state machine below.
    const self = enemyAt("tank", { x: 0, y: TANK_CHARGE_TRIGGER_RANGE + 100 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(length(result.movement)).toBeCloseTo(TANK_SPEED);
    expect(TANK_SPEED).toBeLessThan(RUSHER_SPEED);
    expect(result.nextChargePhase).toBe("approaching");
  });
});

describe("stepTank: the charge state machine", () => {
  function tankAt(pos: EnemyState["pos"], overrides: Partial<EnemyState> = {}): EnemyState {
    return { ...enemyAt("tank", pos), ...overrides };
  }

  it("freezes and enters windup once in range with its cooldown expired", () => {
    const self = tankAt({ x: 0, y: TANK_CHARGE_TRIGGER_RANGE - 10 }, { attackCooldownRemaining: 0 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.movement).toEqual({ x: 0, y: 0 });
    expect(result.nextChargePhase).toBe("windup");
    // Freshly triggered this frame — the full windup duration, not yet
    // decremented (that starts happening from next frame's tick).
    expect(result.nextChargeTimer).toBeCloseTo(TANK_WINDUP_SECONDS);
  });

  it("does not start a charge while still in range but its cooldown hasn't expired", () => {
    const self = tankAt({ x: 0, y: TANK_CHARGE_TRIGGER_RANGE - 10 }, { attackCooldownRemaining: 2 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.nextChargePhase).toBe("approaching");
    expect(length(result.movement)).toBeCloseTo(TANK_SPEED);
  });

  it("does not start a charge from outside the trigger range even with cooldown expired", () => {
    const self = tankAt({ x: 0, y: TANK_CHARGE_TRIGGER_RANGE + 5 }, { attackCooldownRemaining: 0 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.nextChargePhase).toBe("approaching");
  });

  it("stays frozen for the entire windup, then launches into a fast, direction-locked charge", () => {
    const self = tankAt({ x: 0, y: 100 }, { chargePhase: "windup", chargeTimer: 1 / 60 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.nextChargePhase).toBe("charging");
    expect(length(result.movement)).toBeCloseTo(TANK_CHARGE_SPEED);
    expect(result.nextChargeDirection).toBeDefined();
  });

  it("mid-windup, remains frozen with the timer still counting down", () => {
    const self = tankAt({ x: 0, y: 100 }, { chargePhase: "windup", chargeTimer: 0.5 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.movement).toEqual({ x: 0, y: 0 });
    expect(result.nextChargePhase).toBe("windup");
    expect(result.nextChargeTimer).toBeCloseTo(0.5 - 1 / 60);
  });

  it("keeps charging in its locked direction even if the player moves elsewhere — that's what makes it dodgeable", () => {
    const lockedDirection = { x: 1, y: 0 };
    const self = tankAt(
      { x: 0, y: 0 },
      { chargePhase: "charging", chargeTimer: 0.3, chargeDirection: lockedDirection },
    );
    // Player has since moved far off to the side; a re-aimed charge would
    // move toward THIS position instead of continuing along lockedDirection.
    const movedPlayerPos = { x: -500, y: 500 };
    const result = stepEnemy(self, movedPlayerPos, 1 / 60);
    expect(result.movement.x).toBeCloseTo(lockedDirection.x * TANK_CHARGE_SPEED);
    expect(result.movement.y).toBeCloseTo(0);
    expect(result.nextChargeDirection).toEqual(lockedDirection);
  });

  it("ends the charge and enters its post-charge cooldown once the charge duration elapses", () => {
    const self = tankAt(
      { x: 0, y: 0 },
      { chargePhase: "charging", chargeTimer: 1 / 60, chargeDirection: { x: 1, y: 0 } },
    );
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.nextChargePhase).toBe("approaching");
    expect(result.nextAttackCooldownRemaining).toBe(TANK_CHARGE_COOLDOWN_SECONDS);
  });

  it("full sequence sanity check: windup duration + charge duration match the exported constants", () => {
    // Documents the two numbers that make up "enough time to react": the
    // frozen warning window, then the committed dash.
    expect(TANK_WINDUP_SECONDS).toBeGreaterThan(0.5);
    expect(TANK_CHARGE_DURATION_SECONDS).toBeGreaterThan(0);
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

describe("stepBoss: idle approach", () => {
  function bossAt(pos: EnemyState["pos"], overrides: Partial<EnemyState> = {}): EnemyState {
    return { ...enemyAt("boss", pos), bossPhase: "idle", bossNormalAttackCount: 0, ...overrides };
  }

  it("moves straight toward the player, slower than every other enemy kind", () => {
    const self = bossAt({ x: 0, y: 300 }, { attackCooldownRemaining: 10 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(length(result.movement)).toBeCloseTo(BOSS_SPEED);
    expect(BOSS_SPEED).toBeLessThan(TANK_SPEED);
    expect(BOSS_SPEED).toBeLessThan(RUSHER_SPEED);
    expect(BOSS_SPEED).toBeLessThan(SHOOTER_SPEED);
    expect(result.nextBossPhase).toBe("idle");
  });

  it("does not start warming up while its attack cooldown hasn't expired", () => {
    const self = bossAt({ x: 0, y: 300 }, { attackCooldownRemaining: 1 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.nextBossPhase).toBe("idle");
    expect(result.firedProjectiles).toBeUndefined();
  });
});

describe("stepBoss: normal attack (8-shot fan)", () => {
  function bossAt(pos: EnemyState["pos"], overrides: Partial<EnemyState> = {}): EnemyState {
    return { ...enemyAt("boss", pos), bossPhase: "idle", bossNormalAttackCount: 0, ...overrides };
  }

  it("freezes and enters a warning, locking the aim angle, once its cooldown expires", () => {
    const self = bossAt({ x: -100, y: 0 }, { attackCooldownRemaining: 0 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.movement).toEqual({ x: 0, y: 0 });
    expect(result.nextBossPhase).toBe("normalWarning");
    expect(result.nextBossPhaseTimer).toBeCloseTo(BOSS_ATTACK_WARNING_SECONDS);
    expect(result.nextBossLockedAimAngle).toBeCloseTo(angleOf(subtract(PLAYER_POS, { x: -100, y: 0 })));
  });

  it("stays frozen for the whole warning, with the locked angle held even if the player moves elsewhere", () => {
    const lockedAngle = Math.PI / 4;
    const self = bossAt(
      { x: 0, y: 0 },
      { bossPhase: "normalWarning", bossPhaseTimer: 0.5, bossLockedAimAngle: lockedAngle },
    );
    const movedPlayerPos = { x: -500, y: 500 };
    const result = stepEnemy(self, movedPlayerPos, 1 / 60);
    expect(result.movement).toEqual({ x: 0, y: 0 });
    expect(result.nextBossPhase).toBe("normalWarning");
    expect(result.nextBossPhaseTimer).toBeCloseTo(0.5 - 1 / 60);
    expect(result.nextBossLockedAimAngle).toBe(lockedAngle);
  });

  it("fires exactly 8 projectiles, evenly spread across the fan, once the warning elapses", () => {
    const lockedAngle = 0;
    const self = bossAt(
      { x: 0, y: 0 },
      { bossPhase: "normalWarning", bossPhaseTimer: 1 / 60, bossLockedAimAngle: lockedAngle, bossNormalAttackCount: 0 },
    );
    const result = stepEnemy(self, { x: 1000, y: 0 }, 1 / 60);
    expect(result.firedProjectiles).toHaveLength(BOSS_NORMAL_ATTACK_PROJECTILE_COUNT);
    expect(result.firedProjectile).toBeUndefined(); // never both attack shapes in the same tick
    for (const shot of result.firedProjectiles!) {
      const angle = angleOf(shot.direction);
      const deltaFromCenter = Math.abs(Math.atan2(Math.sin(angle - lockedAngle), Math.cos(angle - lockedAngle)));
      expect(deltaFromCenter).toBeLessThanOrEqual(BOSS_NORMAL_ATTACK_FAN_RADIANS / 2 + 1e-9);
    }
    // Evenly spread: the two outermost shots should sit at the fan's edges.
    const angles = result.firedProjectiles!.map((s) => angleOf(s.direction)).sort((a, b) => a - b);
    expect(angles[0]).toBeCloseTo(lockedAngle - BOSS_NORMAL_ATTACK_FAN_RADIANS / 2);
    expect(angles[angles.length - 1]).toBeCloseTo(lockedAngle + BOSS_NORMAL_ATTACK_FAN_RADIANS / 2);
  });

  it("returns to idle, resets its cooldown, and counts the completed attack", () => {
    const self = bossAt(
      { x: 0, y: 0 },
      { bossPhase: "normalWarning", bossPhaseTimer: 1 / 60, bossLockedAimAngle: 0, bossNormalAttackCount: 1 },
    );
    const result = stepEnemy(self, { x: 1000, y: 0 }, 1 / 60);
    expect(result.nextBossPhase).toBe("idle");
    expect(result.nextAttackCooldownRemaining).toBe(BOSS_ATTACK_COOLDOWN_SECONDS);
    expect(result.nextBossNormalAttackCount).toBe(2);
  });

  it("damages the player only through the fired projectiles themselves, never on a bare warning", () => {
    // The warning phase alone never returns firedProjectiles — only the
    // exact tick the timer elapses does (covered above).
    const self = bossAt(
      { x: 0, y: 0 },
      { bossPhase: "normalWarning", bossPhaseTimer: 0.3, bossLockedAimAngle: 0 },
    );
    const result = stepEnemy(self, { x: 1000, y: 0 }, 1 / 60);
    expect(result.firedProjectiles).toBeUndefined();
  });
});

describe("stepBoss: every 3rd normal attack is replaced by a special 24-shot ring", () => {
  function bossAt(pos: EnemyState["pos"], overrides: Partial<EnemyState> = {}): EnemyState {
    return { ...enemyAt("boss", pos), bossPhase: "idle", bossNormalAttackCount: 0, ...overrides };
  }

  it("still warms up normally for the 1st, 2nd and 3rd attacks", () => {
    for (const count of [0, 1, 2]) {
      const self = bossAt({ x: -100, y: 0 }, { attackCooldownRemaining: 0, bossNormalAttackCount: count });
      const result = stepEnemy(self, PLAYER_POS, 1 / 60);
      expect(result.nextBossPhase).toBe("normalWarning");
    }
  });

  it(`starts a special warning once ${BOSS_NORMAL_ATTACKS_BEFORE_SPECIAL} normal attacks have completed`, () => {
    const self = bossAt(
      { x: -100, y: 0 },
      { attackCooldownRemaining: 0, bossNormalAttackCount: BOSS_NORMAL_ATTACKS_BEFORE_SPECIAL },
    );
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.nextBossPhase).toBe("specialWarning");
  });

  it("fires exactly 24 projectiles, evenly spaced across the full ring, once the special warning elapses", () => {
    const self = bossAt(
      { x: 0, y: 0 },
      { bossPhase: "specialWarning", bossPhaseTimer: 1 / 60, bossLockedAimAngle: 0, bossNormalAttackCount: 3 },
    );
    const result = stepEnemy(self, { x: 1000, y: 0 }, 1 / 60);
    expect(result.firedProjectiles).toHaveLength(BOSS_SPECIAL_ATTACK_PROJECTILE_COUNT);
    expect(result.firedProjectile).toBeUndefined();

    const angles = result.firedProjectiles!.map((s) => angleOf(s.direction)).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => (i === 0 ? a + 2 * Math.PI - angles[angles.length - 1] : a - angles[i - 1]));
    const expectedGap = (2 * Math.PI) / BOSS_SPECIAL_ATTACK_PROJECTILE_COUNT;
    for (const gap of gaps) expect(gap).toBeCloseTo(expectedGap);
  });

  it("resets the normal-attack counter to 0 after the special attack fires", () => {
    const self = bossAt(
      { x: 0, y: 0 },
      { bossPhase: "specialWarning", bossPhaseTimer: 1 / 60, bossLockedAimAngle: 0, bossNormalAttackCount: 3 },
    );
    const result = stepEnemy(self, { x: 1000, y: 0 }, 1 / 60);
    expect(result.nextBossNormalAttackCount).toBe(0);
    expect(result.nextBossPhase).toBe("idle");
  });

  it("goes back to a normal 8-shot attack for the next one, after a special reset the counter", () => {
    const self = bossAt({ x: -100, y: 0 }, { attackCooldownRemaining: 0, bossNormalAttackCount: 0 });
    const result = stepEnemy(self, PLAYER_POS, 1 / 60);
    expect(result.nextBossPhase).toBe("normalWarning");
  });
});
