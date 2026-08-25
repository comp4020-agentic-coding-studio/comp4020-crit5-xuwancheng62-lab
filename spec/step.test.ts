import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../src/game/state";
import { step } from "../src/game/step";
import { RUN_LENGTH_SECONDS } from "../src/game/spawn/spawn-tuning";

const DT = 1 / 60;
const NO_MOVEMENT = { moveVector: { x: 0, y: 0 } };

function runFor(state: ReturnType<typeof createInitialGameState>, seconds: number) {
  let s = state;
  for (let t = 0; t < seconds; t += DT) s = step(s, NO_MOVEMENT, DT);
  return s;
}

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

describe("step: contact damage", () => {
  it("damages the player on contact and grants brief invulnerability", () => {
    const state = createInitialGameState(4);
    const touching = {
      ...state,
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
    const dying = { ...state, player: { ...state.player, hp: 0.001 } };
    const lethalEnemy = {
      ...dying,
      enemies: [
        { id: "lethal", kind: "tank" as const, pos: state.player.pos, radius: 22, hp: 999, maxHp: 999, attackCooldownRemaining: 0 },
      ],
    };
    const after = step(lethalEnemy, NO_MOVEMENT, DT);
    expect(after.ending).toBe("lost");
  });

  it("is a win once the run-length timer elapses, health permitting", () => {
    const state = createInitialGameState(6);
    const almostDone = { ...state, elapsedSeconds: RUN_LENGTH_SECONDS - DT / 2 };
    const after = step(almostDone, NO_MOVEMENT, DT);
    expect(after.ending).toBe("won");
  });

  it("loss takes precedence over a simultaneous win", () => {
    const state = createInitialGameState(7);
    const both = {
      ...state,
      elapsedSeconds: RUN_LENGTH_SECONDS - DT / 2,
      player: { ...state.player, hp: 0.001 },
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
