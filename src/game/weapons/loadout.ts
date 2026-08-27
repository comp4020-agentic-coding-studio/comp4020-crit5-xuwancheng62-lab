// The run's defining rule, and the spec's required "one important rule with a
// focused automated test": the first three DISTINCT weapon types found lock
// the build for the entire run. No swap, no replacement, ever. After that, a
// pickup either levels up a type you already hold, or is wasted.

import type { Loadout, WeaponId, WeaponSlot } from "./weapon-types";

export const MAX_SLOTS = 3;
export const MAX_LEVEL = 8;

/**
 * Pure: never mutates `loadout`. Returns the SAME reference when a pickup
 * has no effect (already at MAX_LEVEL, or a new type once slots are full) —
 * cheap for a caller to detect "nothing happened" via ===, and a small
 * defence against needless per-frame allocation in the step() loop.
 */
export function applyPickup(loadout: Loadout, pickedType: WeaponId): Loadout {
  const existingIndex = loadout.slots.findIndex((slot) => slot.type === pickedType);

  if (existingIndex !== -1) {
    const existing = loadout.slots[existingIndex];
    if (existing.level >= MAX_LEVEL) return loadout;
    const nextSlots = loadout.slots.slice();
    nextSlots[existingIndex] = { type: existing.type, level: existing.level + 1 };
    return { slots: nextSlots };
  }

  if (loadout.slots.length >= MAX_SLOTS) return loadout;

  const newSlot: WeaponSlot = { type: pickedType, level: 1 };
  return { slots: [...loadout.slots, newSlot] };
}

export function isLocked(loadout: Loadout): boolean {
  return loadout.slots.length >= MAX_SLOTS;
}

export function levelOf(loadout: Loadout, type: WeaponId): number {
  return loadout.slots.find((slot) => slot.type === type)?.level ?? 0;
}

export function holds(loadout: Loadout, type: WeaponId): boolean {
  return levelOf(loadout, type) > 0;
}
