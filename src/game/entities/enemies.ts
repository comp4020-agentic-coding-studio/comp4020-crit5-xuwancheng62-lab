// Three enemy kinds, escalating via the spawn director (spawn/spawn-director.ts)
// over the run rather than via more kinds. Each is a pure function of
// (self, playerPos, dt) -> what it wants to do this tick; nothing here
// mutates `self` — the caller writes `nextAttackCooldownRemaining` back onto
// the entity and applies `movement * dt` to its position.

import type { Vector2 } from "../types";
import { angleOf, distance, fromAngle, normalize, scale, subtract } from "../vector";

export type EnemyKind = "rusher" | "shooter" | "tank" | "boss";

/** Tank's charge state machine. Absent (undefined on a fresh/non-Tank
 * EnemyState) behaves exactly like "approaching". */
export type TankChargePhase = "approaching" | "windup" | "charging";

/** Boss's attack state machine. Absent (undefined on a fresh/non-Boss
 * EnemyState) behaves exactly like "idle". */
export type BossPhase = "idle" | "normalWarning" | "specialWarning";

/** One projectile of a Boss volley (the 8-shot fan or the 28-shot ring) —
 * unlike FiredProjectileRequest below, each shot carries its own explicit
 * direction rather than a single shared "towards" point, since a fan/ring's
 * individual shots aim in different directions from one another. */
export interface BossProjectileRequest {
  readonly from: Vector2;
  readonly direction: Vector2;
}

export interface EnemyState {
  readonly id: string;
  readonly kind: EnemyKind;
  readonly pos: Vector2;
  readonly radius: number; // collision/hit-test size — also the visual "how big is the blob"
  readonly hp: number;
  readonly maxHp: number;
  /** For Shooter: cooldown until its next shot. For Tank: cooldown until it
   * may next START a charge (only consulted while chargePhase is
   * "approaching"). Harmless dead weight on Rusher. */
  readonly attackCooldownRemaining: number;
  /** Tank only. */
  readonly chargePhase?: TankChargePhase;
  /** Counts down the current windup/charging phase's remaining duration.
   * Unused while approaching. */
  readonly chargeTimer?: number;
  /** Locked in the instant the charge launches (end of windup) — the
   * charge then commits to this direction even if the player dodges,
   * which is exactly what makes it dodgeable. */
  readonly chargeDirection?: Vector2;

  /** Boss only. */
  readonly bossPhase?: BossPhase;
  /** Counts down the current warning phase's remaining duration. Unused
   * while idle. */
  readonly bossPhaseTimer?: number;
  /** Completed normal attacks since the last special attack (or since spawn)
   * — reset to 0 the instant a special attack fires. */
  readonly bossNormalAttackCount?: number;
  /** Locked the instant a warning phase begins (idle -> normalWarning /
   * specialWarning) — the volley then fires along this direction (or, for
   * the ring, starting from it) regardless of where the player moves during
   * the warning, exactly like Tank's chargeDirection. */
  readonly bossLockedAimAngle?: number;
}

export interface FiredProjectileRequest {
  readonly from: Vector2;
  readonly towards: Vector2; // the player's position at the moment of firing
}

export interface EnemyAiResult {
  readonly movement: Vector2; // world units/second; caller multiplies by dt
  readonly firedProjectile?: FiredProjectileRequest;
  readonly nextAttackCooldownRemaining: number;
  /** Tank only — see EnemyState's own fields for what each means. */
  readonly nextChargePhase?: TankChargePhase;
  readonly nextChargeTimer?: number;
  readonly nextChargeDirection?: Vector2;
  /** Boss only — a whole volley fired the same tick, each shot with its own
   * direction (see BossProjectileRequest). Separate from firedProjectile
   * above (Shooter's single shot toward one point) since a fan/ring's shots
   * don't share one target. */
  readonly firedProjectiles?: readonly BossProjectileRequest[];
  readonly nextBossPhase?: BossPhase;
  readonly nextBossPhaseTimer?: number;
  readonly nextBossNormalAttackCount?: number;
  readonly nextBossLockedAimAngle?: number;
}

// Placeholder tuning — see spawn/spawn-tuning.ts for the note this applies
// everywhere in this codebase: numbers here are guesses pending playtesting.
export const RUSHER_SPEED = 100;
export const RUSHER_MAX_HP = 6;

export const TANK_SPEED = 38;
export const TANK_MAX_HP = 40;

/** Only start a charge within this distance — a Tank that's still far away
 * just keeps lumbering in. */
export const TANK_CHARGE_TRIGGER_RANGE = 220;
/** How long the Tank freezes in place before charging — the whole "clearly
 * noticeable moment" a player needs to see it coming and get clear. */
export const TANK_WINDUP_SECONDS = 0.9;
export const TANK_CHARGE_SPEED = 260;
/** Was 0.6 (a 156-unit dash at TANK_CHARGE_SPEED); shortened so the total
 * charge distance reads and dodges more easily — the Tank commits to less
 * ground, so stepping clear of its path matters again sooner instead of
 * needing to stay clear for as long. Speed and windup are unchanged, so the
 * charge still launches just as fast and telegraphs just as long — only how
 * far it travels shrank. */
export const TANK_CHARGE_DURATION_SECONDS = 0.35;
/** Time after a charge finishes before the next one may begin. */
export const TANK_CHARGE_COOLDOWN_SECONDS = 3.5;

export const SHOOTER_SPEED = 42;
export const SHOOTER_MAX_HP = 12;
export const SHOOTER_PREFERRED_DISTANCE = 200;
export const SHOOTER_DISTANCE_TOLERANCE = 24;
/** Slower than it looks at a glance — faster bullets (see
 * ENEMY_PROJECTILE_SPEED in step.ts) made each individual shot harder to
 * react to, and Shooters never despawn, so an unthrottled fire rate let
 * accumulated Shooters stack into an unavoidable crossfire once the map
 * gained a hard boundary (world-bounds.ts) and running forever stopped
 * being an option. */
export const SHOOTER_FIRE_COOLDOWN_SECONDS = 2.4;

/** Slower than Tank (TANK_SPEED) — a legless hovering mass, not a charger. */
export const BOSS_SPEED = 22;
/** Reinforced for the final encounter — 50% above the previous 1,350 HP. */
export const BOSS_MAX_HP = 2025;
/** Its own collision radius — deliberately bigger than Tank's (22) to match
 * its bulk, but unrelated to how large it's actually drawn (canvas-renderer.ts
 * renders it 1.6-1.8x Tank's sprite size, purely cosmetic — same
 * radius-vs-sprite-scale split every other enemy kind already has). */
export const BOSS_RADIUS = 48;
/** Both the normal and special attack's telegraph — "a clear 0.6-second
 * eye-glow warning" per the brief; reused for the special attack too since
 * no separate duration was specified and a player needs the same fair
 * warning either way. */
export const BOSS_ATTACK_WARNING_SECONDS = 0.6;
/** Idle/approach time between the end of one attack and the start of the
 * next warning. Placeholder tuning pending playtesting, like every other
 * enemy's pacing constant in this file. */
export const BOSS_ATTACK_COOLDOWN_SECONDS = 2;
/** Once reduced to half health, the Boss attacks twice as often. */
export const BOSS_ENRAGED_ATTACK_COOLDOWN_SECONDS = 1;
export const BOSS_NORMAL_ATTACKS_BEFORE_SPECIAL = 2;
export const BOSS_NORMAL_ATTACK_PROJECTILE_COUNT = 8;
export const BOSS_SPECIAL_ATTACK_PROJECTILE_COUNT = 28;
/** Total angular width the 8-shot fan spreads across, centered on the
 * locked aim direction — a "spread/fan aimed toward the player", not a full
 * ring (that's the special attack). */
export const BOSS_NORMAL_ATTACK_FAN_RADIANS = Math.PI / 4;
/** Boss takes damage normally but is completely immune to displacement. */
export const BOSS_KNOCKBACK_RESISTANCE = 0;

export function spawnBoss(id: string, pos: Vector2): EnemyState {
  return {
    id,
    kind: "boss",
    pos,
    radius: BOSS_RADIUS,
    hp: BOSS_MAX_HP,
    maxHp: BOSS_MAX_HP,
    // A short grace period before its first attack, rather than firing the
    // instant it appears — gives the player (and its own arrival roar) a
    // moment to land first.
    attackCooldownRemaining: BOSS_ATTACK_COOLDOWN_SECONDS,
    bossPhase: "idle",
    bossNormalAttackCount: 0,
  };
}

/** Evenly spaces `count` angles across `spread` radians, centered on
 * `center` — the 8-shot fan. `count === 1` falls back to just `center`
 * rather than dividing by zero (not reachable with the brief's fixed
 * BOSS_NORMAL_ATTACK_PROJECTILE_COUNT, but keeps this usable standalone). */
function fanAngles(center: number, spread: number, count: number): number[] {
  if (count <= 1) return [center];
  const angles: number[] = [];
  for (let i = 0; i < count; i += 1) {
    angles.push(center - spread / 2 + (spread * i) / (count - 1));
  }
  return angles;
}

/** Evenly spaces `count` angles across a complete circle, starting at
 * `start` — the 28-shot ring. */
function ringAngles(start: number, count: number): number[] {
  const angles: number[] = [];
  for (let i = 0; i < count; i += 1) {
    angles.push(start + (2 * Math.PI * i) / count);
  }
  return angles;
}

/**
 * Idle (slowly approaching) -> warning (frozen, direction locked, telegraphed
 * for BOSS_ATTACK_WARNING_SECONDS) -> fires its volley the instant the
 * warning elapses -> back to idle. After BOSS_NORMAL_ATTACKS_BEFORE_SPECIAL
 * completed normal attacks, the next attack is a special 28-shot ring instead of
 * a normal 8-shot fan; the normal-attack counter then resets. Never fires
 * both in the same tick — it's a strict either/or state machine, not two
 * independent timers.
 */
function stepBoss(self: EnemyState, playerPos: Vector2, dt: number): EnemyAiResult {
  const phase: BossPhase = self.bossPhase ?? "idle";
  const normalAttackCount = self.bossNormalAttackCount ?? 0;
  const attackCooldown =
    self.hp <= self.maxHp * 0.5 ? BOSS_ENRAGED_ATTACK_COOLDOWN_SECONDS : BOSS_ATTACK_COOLDOWN_SECONDS;

  if (phase === "idle") {
    // Cap an in-progress normal cooldown as soon as enrage begins, so the
    // faster cadence takes effect immediately rather than one attack later.
    const cooldownRemaining = Math.min(self.attackCooldownRemaining, attackCooldown) - dt;
    if (cooldownRemaining <= 0) {
      // Locked NOW, at the exact instant the warning begins — never
      // re-aimed while it plays out, which is what makes it dodgeable.
      const lockedAngle = angleOf(subtract(playerPos, self.pos));
      const startingSpecial = normalAttackCount >= BOSS_NORMAL_ATTACKS_BEFORE_SPECIAL;
      return {
        movement: { x: 0, y: 0 },
        nextAttackCooldownRemaining: 0,
        nextBossPhase: startingSpecial ? "specialWarning" : "normalWarning",
        nextBossPhaseTimer: BOSS_ATTACK_WARNING_SECONDS,
        nextBossNormalAttackCount: normalAttackCount,
        nextBossLockedAimAngle: lockedAngle,
      };
    }
    const direction = normalize(subtract(playerPos, self.pos));
    return {
      movement: scale(direction, BOSS_SPEED),
      nextAttackCooldownRemaining: Math.max(0, cooldownRemaining),
      nextBossPhase: "idle",
      nextBossNormalAttackCount: normalAttackCount,
    };
  }

  // normalWarning / specialWarning: frozen and telegraphing, direction
  // already locked when this phase began.
  const lockedAngle = self.bossLockedAimAngle ?? 0;
  const timer = (self.bossPhaseTimer ?? BOSS_ATTACK_WARNING_SECONDS) - dt;
  if (timer > 0) {
    return {
      movement: { x: 0, y: 0 },
      nextAttackCooldownRemaining: 0,
      nextBossPhase: phase,
      nextBossPhaseTimer: timer,
      nextBossNormalAttackCount: normalAttackCount,
      nextBossLockedAimAngle: lockedAngle,
    };
  }

  // The warning just elapsed this tick: fire, exactly once, then return to
  // idle for the next attack's cooldown.
  if (phase === "normalWarning") {
    const angles = fanAngles(lockedAngle, BOSS_NORMAL_ATTACK_FAN_RADIANS, BOSS_NORMAL_ATTACK_PROJECTILE_COUNT);
    return {
      movement: { x: 0, y: 0 },
      firedProjectiles: angles.map((angle) => ({ from: self.pos, direction: fromAngle(angle) })),
      nextAttackCooldownRemaining: attackCooldown,
      nextBossPhase: "idle",
      nextBossNormalAttackCount: normalAttackCount + 1,
    };
  }

  const angles = ringAngles(lockedAngle, BOSS_SPECIAL_ATTACK_PROJECTILE_COUNT);
  return {
    movement: { x: 0, y: 0 },
    firedProjectiles: angles.map((angle) => ({ from: self.pos, direction: fromAngle(angle) })),
    nextAttackCooldownRemaining: attackCooldown,
    nextBossPhase: "idle",
    nextBossNormalAttackCount: 0, // reset after every special attack
  };
}

function stepRusher(self: EnemyState, playerPos: Vector2): EnemyAiResult {
  const direction = normalize(subtract(playerPos, self.pos));
  return { movement: scale(direction, RUSHER_SPEED), nextAttackCooldownRemaining: 0 };
}

/**
 * Approach → windup (frozen, telegraphed) → charge (committed, fast) →
 * approach again. The charge direction is locked the instant it launches,
 * at the end of windup — never re-aimed while charging — so a player who
 * moves during the windup or the charge itself can dodge clear of it.
 */
function stepTank(self: EnemyState, playerPos: Vector2, dt: number): EnemyAiResult {
  const phase: TankChargePhase = self.chargePhase ?? "approaching";

  if (phase === "charging") {
    const direction = self.chargeDirection ?? normalize(subtract(playerPos, self.pos));
    const timer = (self.chargeTimer ?? TANK_CHARGE_DURATION_SECONDS) - dt;
    if (timer <= 0) {
      return {
        movement: scale(direction, TANK_CHARGE_SPEED),
        nextAttackCooldownRemaining: TANK_CHARGE_COOLDOWN_SECONDS,
        nextChargePhase: "approaching",
      };
    }
    return {
      movement: scale(direction, TANK_CHARGE_SPEED),
      nextAttackCooldownRemaining: self.attackCooldownRemaining,
      nextChargePhase: "charging",
      nextChargeTimer: timer,
      nextChargeDirection: direction,
    };
  }

  if (phase === "windup") {
    const timer = (self.chargeTimer ?? TANK_WINDUP_SECONDS) - dt;
    if (timer <= 0) {
      const launchDirection = normalize(subtract(playerPos, self.pos));
      return {
        // The dash starts moving the very frame the windup ends — no extra
        // dead frame between "telegraph over" and "actually charging".
        movement: scale(launchDirection, TANK_CHARGE_SPEED),
        nextAttackCooldownRemaining: self.attackCooldownRemaining,
        nextChargePhase: "charging",
        nextChargeTimer: TANK_CHARGE_DURATION_SECONDS,
        nextChargeDirection: launchDirection,
      };
    }
    return {
      movement: { x: 0, y: 0 }, // frozen — the telegraph the player reacts to
      nextAttackCooldownRemaining: self.attackCooldownRemaining,
      nextChargePhase: "windup",
      nextChargeTimer: timer,
    };
  }

  // approaching
  const direction = normalize(subtract(playerPos, self.pos));
  const cooldownRemaining = self.attackCooldownRemaining - dt;
  if (cooldownRemaining <= 0 && distance(self.pos, playerPos) <= TANK_CHARGE_TRIGGER_RANGE) {
    return {
      movement: { x: 0, y: 0 },
      nextAttackCooldownRemaining: 0,
      nextChargePhase: "windup",
      nextChargeTimer: TANK_WINDUP_SECONDS,
    };
  }
  return {
    movement: scale(direction, TANK_SPEED),
    nextAttackCooldownRemaining: Math.max(0, cooldownRemaining),
    nextChargePhase: "approaching",
  };
}

/** Holds a distance band rather than beelining — closes if too far, backs
 * off if too close, holds still and fires within the band. */
function stepShooter(self: EnemyState, playerPos: Vector2, dt: number): EnemyAiResult {
  const toPlayer = subtract(playerPos, self.pos);
  const dist = distance(playerPos, self.pos);
  const direction = normalize(toPlayer);

  let movement: Vector2;
  if (dist > SHOOTER_PREFERRED_DISTANCE + SHOOTER_DISTANCE_TOLERANCE) {
    movement = scale(direction, SHOOTER_SPEED);
  } else if (dist < SHOOTER_PREFERRED_DISTANCE - SHOOTER_DISTANCE_TOLERANCE) {
    movement = scale(direction, -SHOOTER_SPEED);
  } else {
    movement = { x: 0, y: 0 };
  }

  const cooldownRemaining = self.attackCooldownRemaining - dt;
  if (cooldownRemaining <= 0) {
    return {
      movement,
      firedProjectile: { from: self.pos, towards: playerPos },
      nextAttackCooldownRemaining: SHOOTER_FIRE_COOLDOWN_SECONDS,
    };
  }
  return { movement, nextAttackCooldownRemaining: cooldownRemaining };
}

export function stepEnemy(self: EnemyState, playerPos: Vector2, dt: number): EnemyAiResult {
  switch (self.kind) {
    case "rusher":
      return stepRusher(self, playerPos);
    case "tank":
      return stepTank(self, playerPos, dt);
    case "shooter":
      return stepShooter(self, playerPos, dt);
    case "boss":
      return stepBoss(self, playerPos, dt);
  }
}

export function maxHpFor(kind: EnemyKind): number {
  switch (kind) {
    case "rusher":
      return RUSHER_MAX_HP;
    case "shooter":
      return SHOOTER_MAX_HP;
    case "tank":
      return TANK_MAX_HP;
    case "boss":
      return BOSS_MAX_HP;
  }
}

/** Small/plain, medium-with-a-tell, large-and-wide — the visual design's
 * silhouette sizing carried into the actual hit-test radius, not just the
 * drawing. */
export function radiusFor(kind: EnemyKind): number {
  switch (kind) {
    case "rusher":
      return 11;
    case "shooter":
      return 14;
    case "tank":
      return 22;
    case "boss":
      return BOSS_RADIUS;
  }
}

export function contactDamageFor(kind: EnemyKind): number {
  switch (kind) {
    case "rusher":
      return 13;
    case "shooter":
      return 8;
    case "tank":
      return 32;
    // The Boss only hurts the player through its ranged attacks (see
    // stepBoss) — step.ts's touching-contact check explicitly excludes
    // "boss" from this lookup entirely, so this case is never actually
    // read. 0 kept only so the switch stays exhaustive.
    case "boss":
      return 0;
  }
}

/** A charging Tank is fully committed to its locked direction and can't be
 * knocked off it, stunned, or otherwise interrupted — it still takes damage
 * normally, just nothing that would displace or halt it. Not during windup
 * (still fully interruptible, telegraph and all) or approach. Consulted by
 * combat.ts wherever a hit would otherwise apply knockback/displacement. */
export function hasSuperArmor(enemy: EnemyState): boolean {
  return enemy.kind === "tank" && enemy.chargePhase === "charging";
}

export function findNearestEnemy(pos: Vector2, enemies: readonly EnemyState[]): EnemyState | null {
  let nearest: EnemyState | null = null;
  let nearestDistance = Infinity;
  for (const enemy of enemies) {
    const d = distance(pos, enemy.pos);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = enemy;
    }
  }
  return nearest;
}

export const LATE_GAME_HEALTH_BOOST_START_SECONDS = 60;
export const LATE_GAME_HEALTH_MULTIPLIER = 1.2;

/** Only newly spawned Tanks and Shooters are reinforced after 60 seconds;
 * existing enemies keep their current/max HP, so the transition never heals
 * anything already on the field. */
export function spawnEnemy(id: string, kind: EnemyKind, pos: Vector2, elapsedSeconds = 0): EnemyState {
  const receivesLateGameBoost =
    elapsedSeconds >= LATE_GAME_HEALTH_BOOST_START_SECONDS && (kind === "tank" || kind === "shooter");
  const maxHp = maxHpFor(kind) * (receivesLateGameBoost ? LATE_GAME_HEALTH_MULTIPLIER : 1);
  return {
    id,
    kind,
    pos,
    radius: radiusFor(kind),
    hp: maxHp,
    maxHp,
    attackCooldownRemaining: 0,
  };
}
