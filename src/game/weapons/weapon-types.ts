export type WeaponId = "blade" | "pistol" | "scattergun" | "beam" | "rocket" | "turret";

export const WEAPON_IDS: readonly WeaponId[] = [
  "blade",
  "pistol",
  "scattergun",
  "beam",
  "rocket",
  "turret",
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
