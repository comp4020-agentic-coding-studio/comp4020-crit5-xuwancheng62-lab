import { describe, expect, it } from "vitest";
import {
  MAX_LEVEL,
  MAX_SLOTS,
  applyPickup,
  holds,
  isLocked,
  levelOf,
} from "../src/game/weapons/loadout";
import { EMPTY_LOADOUT, type Loadout, type WeaponId } from "../src/game/weapons/weapon-types";

function applyPickups(types: readonly WeaponId[]): Loadout {
  return types.reduce(applyPickup, EMPTY_LOADOUT);
}

// The spec's required "one important rule, one focused test": the first
// three distinct weapon types found lock the build for the whole run — no
// swap, no replacement — and only a pickup matching an already-held type
// does anything once you're full.

describe("applyPickup: a new type with room in the loadout", () => {
  it("adds it at level 1", () => {
    const result = applyPickup(EMPTY_LOADOUT, "blade");
    expect(result.slots).toEqual([{ type: "blade", level: 1 }]);
  });

  it("appends behind existing slots, preserving arrival order", () => {
    const one = applyPickup(EMPTY_LOADOUT, "blade");
    const two = applyPickup(one, "pistol");
    expect(two.slots.map((s) => s.type)).toEqual(["blade", "pistol"]);
  });
});

describe("applyPickup: a repeat of an already-held type", () => {
  it("increments that slot's level by 1", () => {
    const one = applyPickup(EMPTY_LOADOUT, "blade");
    const two = applyPickup(one, "blade");
    expect(levelOf(two, "blade")).toBe(2);
  });

  it("does not add a second slot for the same type", () => {
    const one = applyPickup(EMPTY_LOADOUT, "blade");
    const two = applyPickup(one, "blade");
    expect(two.slots).toHaveLength(1);
  });

  it(`caps at level ${MAX_LEVEL} with no overflow`, () => {
    let loadout = applyPickup(EMPTY_LOADOUT, "blade");
    for (let i = 0; i < 10; i += 1) loadout = applyPickup(loadout, "blade");
    expect(levelOf(loadout, "blade")).toBe(MAX_LEVEL);
  });

  it("is a true no-op once capped: same reference back, not just same value", () => {
    let capped = applyPickup(EMPTY_LOADOUT, "blade");
    for (let i = 1; i < MAX_LEVEL; i += 1) capped = applyPickup(capped, "blade");
    expect(levelOf(capped, "blade")).toBe(MAX_LEVEL);

    const again = applyPickup(capped, "blade");
    expect(again).toBe(capped);
  });
});

describe("applyPickup: a new type once all slots are full", () => {
  function fullLoadout(): Loadout {
    return applyPickups(["blade", "pistol", "scattergun"]);
  }

  it(`fills exactly ${MAX_SLOTS} slots from ${MAX_SLOTS} distinct types`, () => {
    expect(fullLoadout().slots).toHaveLength(MAX_SLOTS);
    expect(isLocked(fullLoadout())).toBe(true);
  });

  it("a 4th distinct type is wasted: the loadout comes back unchanged", () => {
    const before = fullLoadout();
    const after = applyPickup(before, "beam");
    expect(after).toBe(before);
    expect(holds(after, "beam")).toBe(false);
  });

  it("every type not among the locked-in three is permanently unreachable", () => {
    const before = fullLoadout();
    for (const type of ["beam", "rocket", "turret"] as WeaponId[]) {
      expect(applyPickup(before, type)).toBe(before);
    }
  });
});

describe("applyPickup: repeats before the loadout is full", () => {
  it("never consume a slot — only a genuinely new type does", () => {
    // pistol x3 (levels up, same slot), then two new types: exactly 3 slots.
    const loadout = applyPickups(["pistol", "pistol", "pistol", "blade", "scattergun"]);
    expect(loadout.slots).toHaveLength(3);
    expect(levelOf(loadout, "pistol")).toBe(3);
    expect(levelOf(loadout, "blade")).toBe(1);
    expect(levelOf(loadout, "scattergun")).toBe(1);

    // The build is now locked; a 4th distinct type is wasted.
    const withBeam = applyPickup(loadout, "beam");
    expect(withBeam).toBe(loadout);
  });
});

describe("applyPickup: which three types lock in is order-sensitive, not level-sensitive", () => {
  it("interleaving pickups of the same 3 types yields the same locked set regardless of order", () => {
    const a = applyPickups(["blade", "pistol", "blade", "scattergun", "rocket"]);
    const b = applyPickups(["blade", "blade", "scattergun", "pistol", "rocket"]);
    const lockedTypes = (loadout: Loadout) => new Set(loadout.slots.map((s) => s.type));
    expect(lockedTypes(a)).toEqual(new Set(["blade", "pistol", "scattergun"]));
    expect(lockedTypes(a)).toEqual(lockedTypes(b));
    // Both fed one extra "blade" repeat before the build locked, so both
    // should show it at level 2, not just "some level > 1".
    expect(levelOf(a, "blade")).toBe(2);
    expect(levelOf(b, "blade")).toBe(2);
  });
});

describe("applyPickup: immutability", () => {
  it("never mutates the loadout it was given", () => {
    const original = applyPickup(EMPTY_LOADOUT, "blade");
    const originalSlotsSnapshot = original.slots.map((s) => ({ ...s }));

    applyPickup(original, "blade"); // level up
    applyPickup(original, "pistol"); // new slot

    expect(original.slots).toEqual(originalSlotsSnapshot);
  });

  it("never mutates EMPTY_LOADOUT itself", () => {
    applyPickup(EMPTY_LOADOUT, "blade");
    expect(EMPTY_LOADOUT.slots).toEqual([]);
  });
});
