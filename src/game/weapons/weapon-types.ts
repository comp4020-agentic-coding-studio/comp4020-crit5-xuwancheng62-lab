export type WeaponId = "blade" | "smg" | "scattergun" | "beam" | "rocket" | "turret" | "nuke";

export const WEAPON_IDS: readonly WeaponId[] = [
  "blade",
  "smg",
  "scattergun",
  "beam",
  "rocket",
  "turret",
  "nuke",
];

export interface WeaponSlot {
  readonly type: WeaponId;
  readonly level: number; // 1..MAX_LEVEL, see loadout.ts
}

/** At most MAX_SLOTS entries, in the order their types were first picked up. */
export interface Loadout {
  readonly slots: readonly WeaponSlot[];
}

export const EMPTY_LOADOUT: Loadout = { slots: [] };
export const INITIAL_LOADOUT: Loadout = { slots: [{ type: "smg", level: 1 }] };
