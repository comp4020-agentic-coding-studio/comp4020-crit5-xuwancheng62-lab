// The one per-frame pure reducer. Composes every system below in order;
// nothing here touches a DOM, a Canvas, or requestAnimationFrame — that's
// src/app.ts's job, and its job alone. All randomness flows through
// state.rng; nothing here ever calls Math.random().

import { applyAreaDamage, applyLineDamage, applyPointDamage, isDead } from "./combat";
import {
  BOSS_RADIUS,
  contactDamageFor,
  findNearestEnemy,
  spawnBoss,
  spawnEnemy,
  stepEnemy,
  type EnemyState,
} from "./entities/enemies";
import {
  PICKUP_COLLECT_RADIUS,
  WEAPON_DROP_CHANCE,
  XP_ORB_VALUE,
  type Pickup,
} from "./entities/pickups";
import {
  isTurretAlive,
  spawnTurret,
  tickTurret,
} from "./entities/placed-entities";
import { movePlayer, regenerate } from "./entities/player";
import {
  instantiateProjectiles,
  isExpired,
  moveProjectile,
  type Projectile,
  type ProjectileSpawn,
} from "./entities/projectiles";
import { statsAtCharacterLevel } from "./leveling/player-stats";
import { gainXp } from "./leveling/xp";
import { circlesOverlap } from "./collision";
import { nextAngle, nextFloat, pick } from "./rng";
import { decideSpawns } from "./spawn/spawn-director";
import { DEFAULT_SPAWN_TUNING, RUN_LENGTH_SECONDS, type SpawnTuning } from "./spawn/spawn-tuning";
import type { ExplosionEffect, GameState } from "./state";
import type { Rng, Vector2 } from "./types";
import { add, fromAngle, normalize, subtract } from "./vector";
import {
  fireBeam,
  fireBeamVisual,
  fireBlade,
  firePistol,
  fireRocket,
  fireScattergun,
  type BeamVisual,
  type InstantEffect,
} from "./weapons/attached-weapons";
import { fireFist } from "./weapons/fist";
import { applyPickup, holds } from "./weapons/loadout";
import { orbitIndices, weaponMuzzlePosition, weaponOrbitPosition } from "./weapons/weapon-orbit";
import {
  beamStats,
  bladeStats,
  fistBaseStats,
  pistolStats,
  rocketStats,
  scattergunStats,
  turretStats,
} from "./weapons/weapon-stats";
import { WEAPON_IDS, type WeaponId } from "./weapons/weapon-types";
import { checkEnding } from "./win-loss";
import { clampToWorld } from "./world-bounds";

export interface StepInput {
  readonly moveVector: Vector2;
}

const CONTACT_INVULNERABILITY_SECONDS = 0.5;
const PLAYER_CONTACT_RADIUS = 14;
const ENEMY_PROJECTILE_SPEED = 150;
const ENEMY_PROJECTILE_RADIUS = 5;
/** Low on purpose: the map's hard boundary (world-bounds.ts) means a player
 * can no longer outrun an accumulating crowd of Shooters forever the way
 * they could in an unbounded world, and per-shot damage is what actually
 * has to absorb that — see SHOOTER_FIRE_COOLDOWN_SECONDS in enemies.ts for
 * the other half of the same fix. Simulated win rate confirmed this at
 * ~47% (n=800) with the current spawn tuning. */
const ENEMY_PROJECTILE_DAMAGE = 2;
const ENEMY_PROJECTILE_LIFESPAN = 2.5;

/** Elapsed-time trigger for the Boss's one-and-only spawn this run — see
 * `bossSpawned` on GameState for how "never again" is enforced. */
const BOSS_SPAWN_AT_SECONDS = 80;
/** "Slightly smaller and slower than normal Shooter projectiles"
 * (ENEMY_PROJECTILE_RADIUS/SPEED above) — used for both the 8-shot fan and
 * the 24-shot ring; the brief only asks the ring to be independently
 * "dodgeable", which the same slow/small orb already satisfies. */
const BOSS_PROJECTILE_SPEED = 130;
const BOSS_PROJECTILE_RADIUS = 4;
const BOSS_PROJECTILE_DAMAGE = 3;
// A bit longer than ENEMY_PROJECTILE_LIFESPAN to cover a similar travel
// distance at BOSS_PROJECTILE_SPEED's lower speed.
const BOSS_PROJECTILE_LIFESPAN = 3;
/** How long a one-shot explosion visual (state.explosions) stays on screen
 * before being pruned — purely cosmetic, unrelated to the splash-damage
 * radius or the projectile's own lifespan. Exported so canvas-renderer.ts's
 * fade-out timing can never drift out of sync with when the effect is
 * actually removed from state. */
export const EXPLOSION_EFFECT_DURATION_SECONDS = 0.4;

export function step(
  state: GameState,
  input: StepInput,
  dtSeconds: number,
  tuning: SpawnTuning = DEFAULT_SPAWN_TUNING,
): GameState {
  if (state.ending !== "playing") return state;

  const elapsedSeconds = state.elapsedSeconds + dtSeconds;
  const characterStats = statsAtCharacterLevel(state.xp.level);
  let rng: Rng = state.rng;
  let nextEntityId = state.nextEntityId;

  function allocateId(prefix: string): string {
    const id = `${prefix}${nextEntityId}`;
    nextEntityId += 1;
    return id;
  }

  // XP is granted the instant a kill lands — no orb, no walking over
  // anything to collect it. Only a weapon has to be walked over, since
  // *which* weapon you happen to path near is the point of the design.
  let xp = state.xp;
  let killCount = state.killCount;

  function lootFor(killed: readonly EnemyState[]): Pickup[] {
    const weaponDrops: Pickup[] = [];
    for (const enemy of killed) {
      xp = gainXp(xp, XP_ORB_VALUE);
      // The very first kill of the run is guaranteed a weapon, so a bad
      // drop-chance roll can never leave the opening stuck on Fist alone.
      const isFirstKillOfRun = killCount === 0;
      killCount += 1;
      const [roll, afterRoll] = nextFloat(rng);
      rng = afterRoll;
      if (isFirstKillOfRun || roll < WEAPON_DROP_CHANCE) {
        const [weaponType, afterPick] = pick(rng, WEAPON_IDS);
        rng = afterPick;
        weaponDrops.push({ kind: "weapon", id: allocateId("d"), pos: enemy.pos, weaponType });
      }
    }
    return weaponDrops;
  }

  // -- player movement + regen ---------------------------------------------
  let player = movePlayer(state.player, input.moveVector, characterStats.moveSpeed, dtSeconds);
  player = { ...player, pos: clampToWorld(player.pos, PLAYER_CONTACT_RADIUS) };
  player = regenerate(player, characterStats.maxHealth, characterStats.hpRegenPerSecond, dtSeconds);

  // -- spawn director -------------------------------------------------------
  const spawnResult = decideSpawns(
    state.spawnDirector,
    elapsedSeconds,
    state.enemies.length,
    player.pos,
    tuning,
    rng,
  );
  rng = spawnResult.nextRng;
  const spawnedEnemies: EnemyState[] = spawnResult.spawns.map((spawn) =>
    spawnEnemy(allocateId("e"), spawn.kind, spawn.pos),
  );

  // -- boss: spawns exactly once, at BOSS_SPAWN_AT_SECONDS ------------------
  let bossSpawned = state.bossSpawned;
  const bossSpawnedEnemies: EnemyState[] = [];
  if (!bossSpawned && elapsedSeconds >= BOSS_SPAWN_AT_SECONDS) {
    const [angle, rngAfterAngle] = nextAngle(rng);
    rng = rngAfterAngle;
    const pos = clampToWorld(add(player.pos, fromAngle(angle, tuning.spawnRingRadius)), BOSS_RADIUS);
    bossSpawnedEnemies.push(spawnBoss(allocateId("boss"), pos));
    bossSpawned = true;
  }

  // -- enemy AI: movement + (Shooter/Boss) firing ---------------------------
  const pendingProjectileSpawns: ProjectileSpawn[] = [];
  let enemies: EnemyState[] = [...state.enemies, ...spawnedEnemies, ...bossSpawnedEnemies].map((enemy) => {
    const result = stepEnemy(enemy, player.pos, dtSeconds);
    if (result.firedProjectile) {
      const direction = directionBetween(result.firedProjectile.from, result.firedProjectile.towards);
      pendingProjectileSpawns.push({
        pos: result.firedProjectile.from,
        vel: { x: direction.x * ENEMY_PROJECTILE_SPEED, y: direction.y * ENEMY_PROJECTILE_SPEED },
        radius: ENEMY_PROJECTILE_RADIUS,
        damage: ENEMY_PROJECTILE_DAMAGE,
        lifespanRemaining: ENEMY_PROJECTILE_LIFESPAN,
        owner: "enemy",
      });
    }
    if (result.firedProjectiles) {
      // A whole volley (the 8-shot fan or the 24-shot ring) fired the same
      // tick — each shot already carries its own direction, unlike the
      // single-target firedProjectile above.
      for (const request of result.firedProjectiles) {
        pendingProjectileSpawns.push({
          pos: request.from,
          vel: { x: request.direction.x * BOSS_PROJECTILE_SPEED, y: request.direction.y * BOSS_PROJECTILE_SPEED },
          radius: BOSS_PROJECTILE_RADIUS,
          damage: BOSS_PROJECTILE_DAMAGE,
          lifespanRemaining: BOSS_PROJECTILE_LIFESPAN,
          owner: "enemy",
        });
      }
    }
    return {
      ...enemy,
      pos: clampToWorld(
        {
          x: enemy.pos.x + result.movement.x * dtSeconds,
          y: enemy.pos.y + result.movement.y * dtSeconds,
        },
        enemy.radius,
      ),
      attackCooldownRemaining: result.nextAttackCooldownRemaining,
      chargePhase: result.nextChargePhase,
      chargeTimer: result.nextChargeTimer,
      chargeDirection: result.nextChargeDirection,
      bossPhase: result.nextBossPhase,
      bossPhaseTimer: result.nextBossPhaseTimer,
      bossNormalAttackCount: result.nextBossNormalAttackCount,
      bossLockedAimAngle: result.nextBossLockedAimAngle,
    };
  });

  // -- weapon systems: Fist (until Blade is picked up) + loadout slots -----
  const instantEffects: InstantEffect[] = [];
  const weaponCooldowns: Partial<Record<WeaponId, number>> = { ...state.weaponCooldowns };
  let fistCooldownRemaining = state.fistCooldownRemaining - dtSeconds;
  // Carried over unchanged unless Beam actually fires this tick (see the
  // loop below) — this is what lets the renderer draw a fixed line for the
  // whole flash instead of a value that drifts frame to frame.
  let beamVisual = state.beamVisual;

  const nearestEnemy = findNearestEnemy(player.pos, enemies);

  // Blade is Fist's direct upgrade — once it's in the loadout (permanently,
  // per the build-lock rule) the bare-hands attack never fires again, so
  // the two melee options don't just stack.
  const fistDisabled = holds(state.loadout, "blade");
  if (fistDisabled) {
    fistCooldownRemaining = Math.max(0, fistCooldownRemaining);
  } else if (fistCooldownRemaining <= 0) {
    instantEffects.push(fireFist(player.pos));
    fistCooldownRemaining = fistBaseStats().cooldownSeconds / characterStats.attackSpeedMultiplier;
  } else {
    fistCooldownRemaining = Math.max(0, fistCooldownRemaining);
  }

  // Every non-turret slot's stable index among the OTHER held (non-turret)
  // weapons — this, not firing order, is what the orbiting weapon icons key
  // off of too (canvas-renderer.ts), so a weapon's position around the
  // player never jumps around depending on cooldown timing.
  const { indices: slotOrbitIndices, total: orbitingWeaponCount } = orbitIndices(state.loadout.slots);

  for (let slotIndex = 0; slotIndex < state.loadout.slots.length; slotIndex += 1) {
    const slot = state.loadout.slots[slotIndex];
    const cooldownRemaining = (weaponCooldowns[slot.type] ?? 0) - dtSeconds;
    if (cooldownRemaining > 0) {
      weaponCooldowns[slot.type] = cooldownRemaining;
      continue;
    }
    if (!nearestEnemy) {
      weaponCooldowns[slot.type] = 0; // held ready; nothing to aim at yet
      continue;
    }
    const aimDirection = normalize(subtract(nearestEnemy.pos, player.pos));
    const orbitPos = weaponOrbitPosition(player.pos, slotOrbitIndices[slotIndex], orbitingWeaponCount);
    const muzzlePos = weaponMuzzlePosition(orbitPos, aimDirection);
    const fired = fireAttachedWeapon(slot.type, slot.level, player.pos, muzzlePos, nearestEnemy.pos, rng);
    rng = fired.nextRng;
    if (fired.effect) instantEffects.push(fired.effect);
    if (fired.projectiles) pendingProjectileSpawns.push(...fired.projectiles);
    if (fired.beamVisual) beamVisual = fired.beamVisual;
    weaponCooldowns[slot.type] = fired.cooldownSeconds / characterStats.attackSpeedMultiplier;
  }

  // -- turret: spawning a new BATCH (its OWN attack cadence, once placed, is
  // handled by tickTurret below — this is only the "deploy the next batch"
  // timer). Weapon level sets how many deploy at once: Lv.1 -> 1, Lv.8 -> 8. --
  let placedEntities = state.placedEntities;
  let turretSpawnCooldownRemaining = state.turretSpawnCooldownRemaining - dtSeconds;
  const turretLevel = state.loadout.slots.find((s) => s.type === "turret")?.level;
  if (turretLevel && turretSpawnCooldownRemaining <= 0) {
    const newTurrets = Array.from({ length: turretLevel }, (_, i) =>
      spawnTurret(allocateId("t"), turretLevel, turretDeployPosition(player.pos, i, turretLevel), elapsedSeconds),
    );
    placedEntities = [...placedEntities, ...newTurrets];
    turretSpawnCooldownRemaining = turretStats(turretLevel).spawnCooldownSeconds;
  } else {
    turretSpawnCooldownRemaining = Math.max(0, turretSpawnCooldownRemaining);
  }

  // -- tick placed entities (turret attacks + expiry) -----------------------
  const tickedTurrets = placedEntities.map((turret) => tickTurret(turret, enemies, dtSeconds));
  for (const result of tickedTurrets) {
    if (result.firedProjectiles) pendingProjectileSpawns.push(...result.firedProjectiles);
  }
  placedEntities = tickedTurrets.map((r) => r.turret).filter((t) => isTurretAlive(t, elapsedSeconds));

  // -- apply instant effects (Blade, Fist, Beam) ----------------------------
  const pickups: Pickup[] = [...state.pickups];
  const explosions: ExplosionEffect[] = [...state.explosions];
  for (const effect of instantEffects) {
    const result =
      effect.kind === "area"
        ? applyAreaDamage(enemies, effect.center, effect.radius, effect.damage, effect.knockback)
        : applyLineDamage(enemies, effect.from, effect.to, effect.width, effect.damage);
    enemies = result.survivors;
    pickups.push(...lootFor(result.killed));
  }

  // -- projectiles: instantiate, move, resolve collisions -------------------
  const instantiated = instantiateProjectiles(pendingProjectileSpawns, nextEntityId);
  nextEntityId = instantiated.nextId;
  const movedProjectiles = [...state.projectiles, ...instantiated.projectiles].map((p) =>
    moveProjectile(p, dtSeconds),
  );

  // "player" projectiles (attached weapons + Turret) can only hit enemies;
  // "enemy" projectiles (Shooter's shot) can only hit the player. Checking
  // every projectile against the enemies list regardless of owner is
  // exactly the bug that let a Shooter's own bullet — spawned at its own
  // position — overlap and kill it the instant it fired.
  const survivingProjectiles: Projectile[] = [];
  const incomingEnemyFire: Projectile[] = [];
  for (const projectile of movedProjectiles) {
    if (isExpired(projectile)) continue;
    if (projectile.owner === "enemy") {
      incomingEnemyFire.push(projectile);
      continue;
    }

    const hitEnemy = enemies.find((enemy) =>
      circlesOverlap({ pos: projectile.pos, radius: projectile.radius }, { pos: enemy.pos, radius: enemy.radius }),
    );
    if (!hitEnemy) {
      survivingProjectiles.push(projectile);
      continue;
    }

    const knockback =
      projectile.knockback !== undefined
        ? { direction: projectile.vel, distance: projectile.knockback }
        : undefined;
    let afterHit = enemies.map((e) => (e.id === hitEnemy.id ? applyPointDamage(e, projectile.damage, knockback) : e));
    if (projectile.onImpact === "explode" && projectile.explodeRadius && projectile.splashDamage) {
      const splash = applyAreaDamage(
        afterHit,
        projectile.pos,
        projectile.explodeRadius,
        projectile.splashDamage,
        projectile.knockback,
      );
      afterHit = splash.survivors;
      pickups.push(...lootFor(splash.killed));
      // Spawned at the exact instant splash damage is applied, sized to the
      // real explodeRadius (cosmetic only — applyAreaDamage above already
      // used that radius for the actual damage calculation).
      explosions.push({
        id: allocateId("x"),
        pos: projectile.pos,
        radius: projectile.explodeRadius,
        startedAt: elapsedSeconds,
      });
    }
    const killedByDirectHit = afterHit.filter(isDead);
    pickups.push(...lootFor(killedByDirectHit));
    enemies = afterHit.filter((e) => !isDead(e));
    // projectile itself is consumed on its first hit — not kept.
  }

  // -- player damage: enemy gunfire and melee contact, one shared
  // invulnerability window so the two sources can't stack into a double hit
  // the same instant --------------------------------------------------------
  let contactInvulnerableRemaining = Math.max(0, player.contactInvulnerableRemaining - dtSeconds);
  let hp = player.hp;

  for (const projectile of incomingEnemyFire) {
    if (contactInvulnerableRemaining > 0) {
      survivingProjectiles.push(projectile); // still airborne; try again next frame
      continue;
    }
    const hitsPlayer = circlesOverlap(
      { pos: projectile.pos, radius: projectile.radius },
      { pos: player.pos, radius: PLAYER_CONTACT_RADIUS },
    );
    if (hitsPlayer) {
      hp = Math.max(0, hp - projectile.damage);
      contactInvulnerableRemaining = CONTACT_INVULNERABILITY_SECONDS;
      // consumed on hit — not kept
    } else {
      survivingProjectiles.push(projectile);
    }
  }

  if (contactInvulnerableRemaining <= 0) {
    const touching = enemies.find(
      (enemy) =>
        // The Boss only hurts the player through its ranged attacks (see
        // stepBoss) — walking into it deals no contact damage.
        enemy.kind !== "boss" &&
        circlesOverlap({ pos: player.pos, radius: PLAYER_CONTACT_RADIUS }, { pos: enemy.pos, radius: enemy.radius }),
    );
    if (touching) {
      hp = Math.max(0, hp - contactDamageFor(touching.kind));
      contactInvulnerableRemaining = CONTACT_INVULNERABILITY_SECONDS;
    }
  }
  player = { ...player, hp, contactInvulnerableRemaining };

  // -- weapon pickups: collected by walking over them, no separate input ----
  const remainingPickups: Pickup[] = [];
  let loadout = state.loadout;
  for (const pickup of pickups) {
    const collected = circlesOverlap(
      { pos: player.pos, radius: PICKUP_COLLECT_RADIUS },
      { pos: pickup.pos, radius: 0 },
    );
    if (!collected) {
      remainingPickups.push(pickup);
      continue;
    }
    loadout = applyPickup(loadout, pickup.weaponType);
  }

  const bossAlive = enemies.some((enemy) => enemy.kind === "boss");
  const ending = checkEnding({
    playerHp: player.hp,
    elapsedSeconds,
    runLengthSeconds: RUN_LENGTH_SECONDS,
    bossSpawned,
    bossAlive,
  });

  return {
    ...state,
    elapsedSeconds,
    rng,
    nextEntityId,
    ending,
    player,
    loadout,
    xp,
    killCount,
    enemies,
    projectiles: survivingProjectiles,
    placedEntities,
    pickups: remainingPickups,
    explosions: explosions.filter((e) => elapsedSeconds - e.startedAt < EXPLOSION_EFFECT_DURATION_SECONDS),
    spawnDirector: spawnResult.nextState,
    weaponCooldowns,
    fistCooldownRemaining,
    turretSpawnCooldownRemaining,
    beamVisual,
    bossSpawned,
  };
}

// --- composition glue, not exported ---------------------------------------

interface AttachedFireResult {
  effect?: InstantEffect;
  projectiles?: ProjectileSpawn[];
  /** Beam only — see fireBeamVisual for why this is separate from `effect`. */
  beamVisual?: BeamVisual;
  cooldownSeconds: number;
  nextRng: Rng;
}

function fireAttachedWeapon(
  type: WeaponId,
  level: number,
  playerPos: Vector2,
  muzzlePos: Vector2,
  nearestEnemyPos: Vector2,
  rng: Rng,
): AttachedFireResult {
  switch (type) {
    case "blade":
      // Ring effect centered on the player's own body, not the orbiting
      // icon — it has to reach every direction around the player equally.
      return { effect: fireBlade(level, playerPos), cooldownSeconds: bladeStats(level).cooldownSeconds, nextRng: rng };
    case "beam":
      // The damage-dealing line (effect) still originates at the player's
      // own body, unchanged — the hitbox the game is already balanced
      // around. beamVisual is the separate, purely cosmetic line the
      // renderer draws, anchored to the visible muzzle instead.
      return {
        effect: fireBeam(level, playerPos, nearestEnemyPos),
        beamVisual: fireBeamVisual(level, playerPos, muzzlePos, nearestEnemyPos),
        cooldownSeconds: beamStats(level).cooldownSeconds,
        nextRng: rng,
      };
    case "pistol":
      return {
        projectiles: [firePistol(level, playerPos, muzzlePos, nearestEnemyPos)],
        cooldownSeconds: pistolStats(level).cooldownSeconds,
        nextRng: rng,
      };
    case "scattergun": {
      const result = fireScattergun(level, playerPos, muzzlePos, nearestEnemyPos, rng);
      return {
        projectiles: result.spawns,
        cooldownSeconds: scattergunStats(level).cooldownSeconds,
        nextRng: result.nextRng,
      };
    }
    case "rocket":
      return {
        projectiles: [fireRocket(level, playerPos, muzzlePos, nearestEnemyPos)],
        cooldownSeconds: rocketStats(level).cooldownSeconds,
        nextRng: rng,
      };
    case "turret":
      // Turret's own fire cadence, once placed, is handled by tickTurret —
      // as a loadout slot it never fires "from the player" itself.
      return { cooldownSeconds: Number.POSITIVE_INFINITY, nextRng: rng };
  }
}

const TURRET_DEPLOY_SPREAD_RADIUS = 28;
/** Roughly the turret's own on-screen half-size (see TURRET_BASE_DIAMETER in
 * canvas-renderer.ts) — clamping to this margin keeps a turret deployed near
 * the world edge fully inside the boundary rather than visually poking
 * through it. */
const TURRET_WORLD_MARGIN = 20;

/** Spreads a same-frame batch of turrets evenly around the player instead
 * of stacking them all on one point — deterministic (index/total only, no
 * rng draw) so batch size never affects the rng stream. Clamped to the
 * world boundary since a player standing near the edge could otherwise
 * place one beyond it. */
function turretDeployPosition(playerPos: Vector2, index: number, total: number): Vector2 {
  if (total <= 1) return clampToWorld(playerPos, TURRET_WORLD_MARGIN);
  const angle = (2 * Math.PI * index) / total;
  return clampToWorld(
    {
      x: playerPos.x + Math.cos(angle) * TURRET_DEPLOY_SPREAD_RADIUS,
      y: playerPos.y + Math.sin(angle) * TURRET_DEPLOY_SPREAD_RADIUS,
    },
    TURRET_WORLD_MARGIN,
  );
}

function directionBetween(from: Vector2, to: Vector2): Vector2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}
