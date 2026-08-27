import { describe, expect, it } from "vitest";
import { BOSS_MAX_HP, BOSS_RADIUS, TANK_MAX_HP } from "../src/game/entities/enemies";
import { createInitialGameState, type GameState } from "../src/game/state";
import { step } from "../src/game/step";
import { RUN_LENGTH_SECONDS } from "../src/game/spawn/spawn-tuning";
import { distance } from "../src/game/vector";
import { WORLD_RADIUS } from "../src/game/world-bounds";

const DT = 1 / 60;
const NO_MOVEMENT = { moveVector: { x: 0, y: 0 } };
const WORLD_ORIGIN = { x: 0, y: 0 };

function runFor(state: ReturnType<typeof createInitialGameState>, seconds: number) {
  let s = state;
  for (let t = 0; t < seconds; t += DT) s = step(s, NO_MOVEMENT, DT);
  return s;
}

describe("step: Blade permanently replaces Fist once picked up", () => {
  it("Fist never fires again — its cooldown stays pinned at 0, not reset to a fresh full value", () => {
    const state = createInitialGameState(50);
    expect(state.fistCooldownRemaining).toBe(0); // ready to fire this very tick, if anything is going to
    const withBlade: GameState = { ...state, loadout: { slots: [{ type: "blade", level: 1 }] } };
    const after = step(withBlade, NO_MOVEMENT, DT);
    expect(after.fistCooldownRemaining).toBe(0);
  });

  it("contrast: without Blade, Fist fires this same tick and its cooldown resets to a real value", () => {
    const state = createInitialGameState(50);
    const after = step(state, NO_MOVEMENT, DT);
    expect(after.fistCooldownRemaining).toBeGreaterThan(0.4);
  });

  it("Blade alone still lands its own hit on a nearby enemy even with Fist disabled", () => {
    const state = createInitialGameState(51);
    const withBladeAndTarget: GameState = {
      ...state,
      loadout: { slots: [{ type: "blade", level: 1 }] },
      enemies: [
        {
          id: "target",
          kind: "rusher" as const,
          pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
          radius: 11,
          hp: 999,
          maxHp: 999,
          attackCooldownRemaining: 0,
        },
      ],
    };
    const after = step(withBladeAndTarget, NO_MOVEMENT, DT);
    const target = after.enemies.find((e) => e.id === "target");
    expect(target).toBeDefined();
    expect(target!.hp).toBeLessThan(999);
  });
});

describe("step: the map has a hard boundary", () => {
  it("never lets the player walk past WORLD_RADIUS, no matter how long they push outward", () => {
    const state = createInitialGameState(40);
    let s = state;
    const pushOutward = { moveVector: { x: 1, y: 0 } };
    for (let t = 0; t < 20; t += DT) s = step(s, pushOutward, DT);
    expect(distance(s.player.pos, WORLD_ORIGIN)).toBeLessThanOrEqual(WORLD_RADIUS);
    // Genuinely pinned at the wall, not just "happens to be under the
    // limit" — 20 seconds of constant outward movement should have long
    // since caught up to any radius smaller than this.
    expect(distance(s.player.pos, WORLD_ORIGIN)).toBeGreaterThan(WORLD_RADIUS - 20);
  });

  it("never lets an enemy drift past WORLD_RADIUS either", () => {
    const state = createInitialGameState(41);
    // A rusher placed at the far edge, chasing a player who is also
    // pinned near the opposite edge — nothing here should ever put the
    // rusher's position beyond the boundary.
    const withEdgeRusher = {
      ...state,
      player: { ...state.player, pos: { x: -WORLD_RADIUS + 10, y: 0 } },
      enemies: [
        { id: "edge", kind: "rusher" as const, pos: { x: WORLD_RADIUS - 5, y: 0 }, radius: 11, hp: 999, maxHp: 999, attackCooldownRemaining: 0 },
      ],
    };
    let s: GameState = withEdgeRusher;
    for (let t = 0; t < 5; t += DT) s = step(s, NO_MOVEMENT, DT);
    const rusher = s.enemies.find((e) => e.id === "edge");
    expect(rusher).toBeDefined();
    expect(distance(rusher!.pos, WORLD_ORIGIN)).toBeLessThanOrEqual(WORLD_RADIUS);
  });
});

describe("step: the whole loop wired together", () => {
  it("spawns an enemy immediately, so the opening screen has something to react to", () => {
    const state = createInitialGameState(1);
    const after = step(state, NO_MOVEMENT, DT);
    expect(after.enemies.length).toBeGreaterThan(0);
  });

  it("Fist attacks on its own and can kill an enemy without any weapon equipped", () => {
    const state = createInitialGameState(1);
    const after = runFor(state, 15);
    // Nothing in the loadout, Fist alone should have landed a kill by now
    // (the very first rusher spawns adjacent-ish and is low HP).
    expect(after.xp.level > 1 || after.xp.xp > 0).toBe(true);
  });

  it("a kill's dropped loot flows through to a level-up", () => {
    // Deterministic, not a balance test: a low-HP enemy placed well within
    // Fist's range but just outside contact range, so it dies to Fist alone
    // without the noise of the spawn director's random timing/positioning.
    // Whether Fist reliably lands kills from a natural spawn is a *balance*
    // question for playtesting/simulate-runs.ts, not this test's job.
    // Close enough that Fist's radius (34) reaches it AND its death
    // position still falls within the pickup-collection radius (16), so the
    // dropped XP orb is collectible the same frame — not testing "does loot
    // teleport to you across the arena", which it correctly does not.
    const state = createInitialGameState(2);
    const withWeakAdjacentEnemy = {
      ...state,
      enemies: [
        {
          id: "target",
          kind: "rusher" as const,
          pos: { x: state.player.pos.x + 10, y: state.player.pos.y },
          radius: 11,
          hp: 1,
          maxHp: 6,
          attackCooldownRemaining: 0,
        },
      ],
    };
    const after = step(withWeakAdjacentEnemy, NO_MOVEMENT, DT);
    // Checking the specific target is gone, not that `enemies` is empty —
    // the spawn director also fires this same frame and adds an unrelated
    // fresh rusher at the spawn ring, which is correct and expected.
    expect(after.enemies.find((e) => e.id === "target")).toBeUndefined();
    expect(after.xp.xp).toBeGreaterThan(0); // or leveled — either way, loot landed
  });

  it("the first enemy killed in the run always drops a weapon, regardless of the roll", () => {
    // 30 units away: within Fist's 42-unit range (survives the overlap test
    // against its own radius). The pickup-collect radius now matches that
    // same 42-unit range, so the dropped weapon is collected the very
    // instant it lands — landing straight in the loadout is exactly what
    // proves both the guaranteed drop AND the matched pickup range worked.
    const state = createInitialGameState(42);
    expect(state.killCount).toBe(0);
    const withWeakEnemy = {
      ...state,
      enemies: [
        {
          id: "target",
          kind: "rusher" as const,
          pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
          radius: 11,
          hp: 1,
          maxHp: 6,
          attackCooldownRemaining: 0,
        },
      ],
    };
    const after = step(withWeakEnemy, NO_MOVEMENT, DT);
    expect(after.killCount).toBe(1);
    expect(after.loadout.slots).toHaveLength(1);
  });

  it("walking onto a weapon pickup updates the loadout", () => {
    const state = createInitialGameState(3);
    const withPickup = {
      ...state,
      pickups: [
        { kind: "weapon" as const, id: "test-pickup", pos: state.player.pos, weaponType: "pistol" as const },
      ],
    };
    const after = step(withPickup, NO_MOVEMENT, DT);
    expect(after.loadout.slots).toEqual([{ type: "pistol", level: 1 }]);
    expect(after.pickups).toHaveLength(0);
  });

  it("does not collect a pickup the player hasn't reached", () => {
    const state = createInitialGameState(3);
    const farPickup = {
      ...state,
      pickups: [
        {
          kind: "weapon" as const,
          id: "far-pickup",
          pos: { x: state.player.pos.x + 5000, y: state.player.pos.y },
          weaponType: "pistol" as const,
        },
      ],
    };
    const after = step(farPickup, NO_MOVEMENT, DT);
    expect(after.loadout.slots).toEqual([]);
    expect(after.pickups).toHaveLength(1);
  });
});

describe("step: enemy gunfire cannot hit enemies, including its own shooter", () => {
  it("a Shooter survives firing its own shot", () => {
    // Placed inside its preferred band, far from the player, so contact
    // damage/melee never enters into it — the only thing that could kill
    // this Shooter is its own bullet, spawned at its own position.
    const state = createInitialGameState(10);
    const shooterPos = { x: state.player.pos.x + 200, y: state.player.pos.y };
    const armed = {
      ...state,
      enemies: [
        {
          id: "self-shooter",
          kind: "shooter" as const,
          pos: shooterPos,
          radius: 14,
          hp: 12,
          maxHp: 12,
          attackCooldownRemaining: 0, // fires this very tick
        },
      ],
    };
    const after = step(armed, NO_MOVEMENT, DT);
    const survivor = after.enemies.find((e) => e.id === "self-shooter");
    expect(survivor).toBeDefined();
    expect(survivor?.hp).toBe(12); // undamaged by its own shot
  });

  it("an enemy projectile passing through a second enemy does not hurt it", () => {
    const state = createInitialGameState(11);
    const shooterPos = { x: state.player.pos.x + 200, y: state.player.pos.y };
    // Directly in the line between the shooter and the player.
    const bystanderPos = { x: state.player.pos.x + 100, y: state.player.pos.y };
    const withBystander = {
      ...state,
      enemies: [
        { id: "shooter", kind: "shooter" as const, pos: shooterPos, radius: 14, hp: 12, maxHp: 12, attackCooldownRemaining: 0 },
        { id: "bystander", kind: "rusher" as const, pos: bystanderPos, radius: 11, hp: 6, maxHp: 6, attackCooldownRemaining: 0 },
      ],
    };
    const after = step(withBystander, NO_MOVEMENT, DT);
    const bystander = after.enemies.find((e) => e.id === "bystander");
    expect(bystander?.hp).toBe(6); // enemy fire passes through other enemies untouched
  });
});

describe("step: weapon hits knock enemies back, Beam excepted", () => {
  // A tank placed 5 units in front of the player: close enough that a
  // Pistol/Beam shot fired this same frame reaches it in the same step
  // (it's a slow-moving projectile relative to the frame's dt, so it must
  // start almost touching its target to land a hit within one tick).
  // Fist is held mid-cooldown so it never fires and never adds its own
  // knockback into the measurement.
  function withGunAndTank(loadoutType: "pistol" | "beam") {
    const state = createInitialGameState(20);
    return {
      ...state,
      fistCooldownRemaining: 10,
      loadout: { slots: [{ type: loadoutType, level: 1 as const }] },
      enemies: [
        { id: "target", kind: "tank" as const, pos: { x: 5, y: 0 }, radius: 22, hp: 999, maxHp: 999, attackCooldownRemaining: 0 },
      ],
    };
  }

  it("Pistol shoves a surviving hit well beyond what the enemy's own movement explains", () => {
    const before = withGunAndTank("pistol");
    const after = step(before, NO_MOVEMENT, DT);
    const target = after.enemies.find((e) => e.id === "target");
    expect(target).toBeDefined();
    // Tank's own AI closes at ~38 units/s (~0.6 units this one frame); a
    // move far beyond that can only be the shot's knockback.
    expect(target!.pos.x).toBeGreaterThan(before.enemies[0].pos.x + 20);
  });

  it("Beam deals its hit but never knocks the target back", () => {
    const before = withGunAndTank("beam");
    const after = step(before, NO_MOVEMENT, DT);
    const target = after.enemies.find((e) => e.id === "target");
    expect(target).toBeDefined();
    expect(target!.hp).toBeLessThan(before.enemies[0].hp); // the hit landed
    // Only the tank's own slow approach should move it — nothing like a
    // 50-unit shove.
    expect(target!.pos.x).toBeLessThan(before.enemies[0].pos.x + 5);
  });
});

describe("step: Beam's locked visual line", () => {
  function withBeamAndTarget() {
    const state = createInitialGameState(21);
    return {
      ...state,
      loadout: { slots: [{ type: "beam" as const, level: 1 as const }] },
      enemies: [
        { id: "target", kind: "rusher" as const, pos: { x: 100, y: 0 }, radius: 11, hp: 999, maxHp: 999, attackCooldownRemaining: 0 },
      ],
    };
  }

  it("is null before Beam has ever fired", () => {
    const state = createInitialGameState(22);
    expect(state.beamVisual).toBeNull();
  });

  it("is set the instant Beam fires, starting away from the player's own center (the muzzle, not the body)", () => {
    const before = withBeamAndTarget();
    const after = step(before, NO_MOVEMENT, DT);
    expect(after.beamVisual).not.toBeNull();
    const dx = after.beamVisual!.from.x - after.player.pos.x;
    const dy = after.beamVisual!.from.y - after.player.pos.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(0);
  });

  it("stays exactly the same, frame to frame, while Beam is on cooldown (not recomputed live)", () => {
    const fired = step(withBeamAndTarget(), NO_MOVEMENT, DT);
    const lockedVisual = fired.beamVisual;
    expect(lockedVisual).not.toBeNull();
    // Move the target so a live recompute (the old per-frame behavior) would
    // visibly change direction/endpoint — a locked value must not budge.
    const withMovedTarget: GameState = { ...fired, enemies: [{ ...fired.enemies[0], pos: { x: -50, y: 80 } }] };
    const next = step(withMovedTarget, NO_MOVEMENT, DT);
    expect(next.beamVisual).toEqual(lockedVisual);
  });
});

describe("step: Shooter's bullet speed", () => {
  it("travels at the increased enemy projectile speed", () => {
    const state = createInitialGameState(30);
    const shooterPos = { x: state.player.pos.x + 200, y: state.player.pos.y };
    const armed = {
      ...state,
      enemies: [
        { id: "shooter", kind: "shooter" as const, pos: shooterPos, radius: 14, hp: 12, maxHp: 12, attackCooldownRemaining: 0 },
      ],
    };
    const after = step(armed, NO_MOVEMENT, DT);
    const bullet = after.projectiles.find((p) => p.owner === "enemy");
    expect(bullet).toBeDefined();
    expect(Math.hypot(bullet!.vel.x, bullet!.vel.y)).toBeCloseTo(150);
  });
});

describe("step: Turret deploys one additional unit per weapon level", () => {
  function withTurretLevel(level: number) {
    const state = createInitialGameState(31);
    return { ...state, loadout: { slots: [{ type: "turret" as const, level }] } };
  }

  it("Lv.1 deploys exactly 1 turret", () => {
    const after = step(withTurretLevel(1), NO_MOVEMENT, DT);
    expect(after.placedEntities).toHaveLength(1);
  });

  it("Lv.5 deploys exactly 5 turrets in the same batch", () => {
    const after = step(withTurretLevel(5), NO_MOVEMENT, DT);
    expect(after.placedEntities).toHaveLength(5);
  });

  it("Lv.8 (the new max level) deploys exactly 8 turrets", () => {
    const after = step(withTurretLevel(8), NO_MOVEMENT, DT);
    expect(after.placedEntities).toHaveLength(8);
  });

  it("a multi-turret batch is spread out, not stacked on one point", () => {
    const after = step(withTurretLevel(4), NO_MOVEMENT, DT);
    const distinctPositions = new Set(after.placedEntities.map((t) => `${t.pos.x},${t.pos.y}`));
    expect(distinctPositions.size).toBe(4);
  });
});

describe("step: contact damage", () => {
  it("damages the player on contact and grants brief invulnerability", () => {
    const state = createInitialGameState(4);
    const touching = {
      ...state,
      // Fist held mid-cooldown so it doesn't also fire this frame — its
      // knockback would shove a same-position enemy out of contact range
      // before the melee check below runs, which isn't what this test is
      // isolating.
      fistCooldownRemaining: 10,
      enemies: [
        { id: "toucher", kind: "tank" as const, pos: state.player.pos, radius: 22, hp: 999, maxHp: 999, attackCooldownRemaining: 0 },
      ],
    };
    const afterOneHit = step(touching, NO_MOVEMENT, DT);
    expect(afterOneHit.player.hp).toBeLessThan(state.player.hp);
    expect(afterOneHit.player.contactInvulnerableRemaining).toBeGreaterThan(0);

    // Immediately stepping again, while still touching, must NOT deal a
    // second hit — that's the whole point of the invulnerability window.
    // hp may creep up very slightly from passive regen in that one frame;
    // what actually matters is that it did not go DOWN again.
    const afterTwoHits = step(afterOneHit, NO_MOVEMENT, DT);
    expect(afterTwoHits.player.hp).toBeGreaterThanOrEqual(afterOneHit.player.hp);
  });
});

describe("step: ending", () => {
  it("is a loss once health reaches zero", () => {
    const state = createInitialGameState(5);
    const dying = { ...state, player: { ...state.player, hp: 0.001 }, fistCooldownRemaining: 10 };
    const lethalEnemy = {
      ...dying,
      enemies: [
        { id: "lethal", kind: "tank" as const, pos: state.player.pos, radius: 22, hp: 999, maxHp: 999, attackCooldownRemaining: 0 },
      ],
    };
    const after = step(lethalEnemy, NO_MOVEMENT, DT);
    expect(after.ending).toBe("lost");
  });

  it("the old timer-win no longer fires by itself once the Boss's spawn time has also passed", () => {
    // RUN_LENGTH_SECONDS (90) falls after BOSS_SPAWN_AT_SECONDS (80), so by
    // the moment the timer would have won the run, the Boss has already
    // appeared this same tick — see win-loss.test.ts for the timer-win rule
    // exercised in isolation, with no Boss involved at all.
    const state = createInitialGameState(6);
    const almostDone = { ...state, elapsedSeconds: RUN_LENGTH_SECONDS - DT / 2 };
    const after = step(almostDone, NO_MOVEMENT, DT);
    expect(after.ending).toBe("playing");
    expect(after.bossSpawned).toBe(true);
    expect(after.enemies.some((e) => e.kind === "boss")).toBe(true);
  });

  it("loss takes precedence over a simultaneous win", () => {
    const state = createInitialGameState(7);
    const both = {
      ...state,
      elapsedSeconds: RUN_LENGTH_SECONDS - DT / 2,
      player: { ...state.player, hp: 0.001 },
      fistCooldownRemaining: 10,
      enemies: [
        { id: "lethal", kind: "tank" as const, pos: state.player.pos, radius: 22, hp: 999, maxHp: 999, attackCooldownRemaining: 0 },
      ],
    };
    const after = step(both, NO_MOVEMENT, DT);
    expect(after.ending).toBe("lost");
  });

  it("stops mutating state once ended — calling step() again is a no-op", () => {
    const state = createInitialGameState(8);
    const ended = { ...state, ending: "lost" as const };
    const after = step(ended, { moveVector: { x: 1, y: 0 } }, DT);
    expect(after).toBe(ended);
  });
});

describe("step: determinism", () => {
  it("the same seed produces the exact same sequence of states", () => {
    const a = runFor(createInitialGameState(99), 5);
    const b = runFor(createInitialGameState(99), 5);
    expect(a).toEqual(b);
  });

  it("a different seed can produce a different sequence", () => {
    const a = runFor(createInitialGameState(99), 5);
    const b = runFor(createInitialGameState(100), 5);
    expect(a).not.toEqual(b);
  });
});

describe("step: Boss integration", () => {
  it("spawns exactly one Boss at 80 seconds, not before", () => {
    const state = createInitialGameState(40);
    const justBefore: GameState = { ...state, elapsedSeconds: 79.9 };
    expect(justBefore.bossSpawned).toBe(false);

    const justAfter = step(justBefore, NO_MOVEMENT, 0.2); // crosses the 80s mark
    expect(justAfter.bossSpawned).toBe(true);
    const bosses = justAfter.enemies.filter((e) => e.kind === "boss");
    expect(bosses).toHaveLength(1);
    expect(bosses[0].hp).toBe(BOSS_MAX_HP);
    expect(bosses[0].maxHp).toBe(BOSS_MAX_HP);
  });

  it("gives the Boss roughly 20-25x the Tank's max health", () => {
    expect(BOSS_MAX_HP).toBeGreaterThanOrEqual(TANK_MAX_HP * 20);
    expect(BOSS_MAX_HP).toBeLessThanOrEqual(TANK_MAX_HP * 25);
  });

  it("never spawns a second Boss later in the same run, even across many ticks past 80s", () => {
    const state = createInitialGameState(41);
    // High HP and an early start near the spawn mark keep this test about
    // the one-boss-per-run invariant, not about surviving an unmitigated
    // horde with no player input for 40+ simulated seconds.
    let s: GameState = { ...state, elapsedSeconds: 75, player: { ...state.player, hp: 1e9 } };
    let bossSpawnTransitions = 0;
    let previouslySpawned = false;
    for (let t = 0; t < 40; t += DT) {
      s = step(s, NO_MOVEMENT, DT);
      if (s.bossSpawned && !previouslySpawned) bossSpawnTransitions += 1;
      previouslySpawned = s.bossSpawned;
      expect(s.enemies.filter((e) => e.kind === "boss").length).toBeLessThanOrEqual(1);
    }
    expect(bossSpawnTransitions).toBe(1);
    expect(s.bossSpawned).toBe(true);
  });

  it("wins immediately the tick the Boss dies, not before", () => {
    const state = createInitialGameState(42);
    const boss = {
      id: "boss0",
      kind: "boss" as const,
      pos: state.player.pos,
      radius: BOSS_RADIUS,
      hp: 1,
      maxHp: BOSS_MAX_HP,
      attackCooldownRemaining: 999,
    };
    const armed: GameState = {
      ...state,
      bossSpawned: true,
      enemies: [boss],
      loadout: { slots: [{ type: "blade", level: 1 }] },
      weaponCooldowns: { blade: 0 },
      fistCooldownRemaining: 10,
    };
    expect(armed.ending).toBe("playing"); // Boss alive, timer long past irrelevant
    const after = step(armed, NO_MOVEMENT, DT);
    expect(after.enemies.some((e) => e.kind === "boss")).toBe(false);
    expect(after.ending).toBe("won");
  });

  it("the player still loses normally at zero health, even with the Boss alive elsewhere", () => {
    const state = createInitialGameState(43);
    const boss = {
      id: "boss0",
      kind: "boss" as const,
      pos: { x: 9999, y: 9999 }, // far away — not what kills the player here
      radius: BOSS_RADIUS,
      hp: BOSS_MAX_HP,
      maxHp: BOSS_MAX_HP,
      attackCooldownRemaining: 999,
    };
    const lethalTank = {
      id: "lethal",
      kind: "tank" as const,
      pos: state.player.pos,
      radius: 22,
      hp: 999,
      maxHp: 999,
      attackCooldownRemaining: 0,
    };
    const dying: GameState = {
      ...state,
      bossSpawned: true,
      enemies: [boss, lethalTank],
      player: { ...state.player, hp: 0.001 },
      fistCooldownRemaining: 10,
    };
    const after = step(dying, NO_MOVEMENT, DT);
    expect(after.ending).toBe("lost");
    // The Boss itself is untouched — it's the tank's contact damage that lost the run.
    expect(after.enemies.find((e) => e.id === "boss0")?.hp).toBe(BOSS_MAX_HP);
  });
});
