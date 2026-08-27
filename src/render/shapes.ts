// Pure geometry descriptors — a rounded blob body + big simple eyes, differing
// by silhouette proportion, size and colour, per the design: small/plain
// Rusher, medium/oval/warm-coloured Shooter, large/wide/dark/thick-outlined
// Tank. canvas-renderer.ts turns these into actual draw calls; nothing here
// touches a Canvas.

import type { EnemyKind } from "../game/entities/enemies";

export interface BlobShape {
  readonly radiusX: number;
  readonly radiusY: number;
  readonly color: string;
  readonly outlineColor: string;
  readonly outlineWidth: number;
  readonly eyeOffsets: readonly { x: number; y: number }[];
  readonly eyeRadius: number;
}

const RUSHER_SHAPE: BlobShape = {
  radiusX: 11,
  radiusY: 11,
  color: "#9aa0a6",
  outlineColor: "#5b6066",
  outlineWidth: 1.5,
  eyeOffsets: [
    { x: -4, y: -2 },
    { x: 4, y: -2 },
  ],
  eyeRadius: 2.2,
};

const SHOOTER_SHAPE: BlobShape = {
  radiusX: 12,
  radiusY: 15,
  color: "#f4b942",
  outlineColor: "#a9791c",
  outlineWidth: 1.5,
  eyeOffsets: [
    { x: -5, y: -4 },
    { x: 5, y: -4 },
  ],
  eyeRadius: 2.6,
};

const TANK_SHAPE: BlobShape = {
  radiusX: 26,
  radiusY: 18,
  color: "#7a2e2e",
  outlineColor: "#3d1414",
  outlineWidth: 2.5,
  // Comically small eyes on a big body — reads as "dumb and heavy" without
  // needing any other cue.
  eyeOffsets: [
    { x: -7, y: -3 },
    { x: 7, y: -3 },
  ],
  eyeRadius: 1.6,
};

/** Vector fallback only — legless, dark, many small eyes, sized to roughly
 * match its own collision radius (BOSS_RADIUS in enemies.ts), same as every
 * other kind's shape. The real look is its raster sprite; this only ever
 * shows before that image has loaded. */
const BOSS_SHAPE: BlobShape = {
  radiusX: 40,
  radiusY: 40,
  color: "#3d1f4d",
  outlineColor: "#1a0d21",
  outlineWidth: 3,
  eyeOffsets: [
    { x: 0, y: -18 },
    { x: -16, y: -4 },
    { x: 16, y: -4 },
    { x: -10, y: 14 },
    { x: 10, y: 14 },
  ],
  eyeRadius: 3,
};

export function shapeFor(kind: EnemyKind): BlobShape {
  switch (kind) {
    case "rusher":
      return RUSHER_SHAPE;
    case "shooter":
      return SHOOTER_SHAPE;
    case "tank":
      return TANK_SHAPE;
    case "boss":
      return BOSS_SHAPE;
  }
}

export interface PlayerShape {
  readonly radius: number;
  readonly color: string;
  readonly outlineColor: string;
}

export const PLAYER_SHAPE: PlayerShape = {
  radius: 14,
  color: "#5b8cff",
  outlineColor: "#e8edff",
};

const WEAPON_COLORS: Readonly<Record<string, string>> = {
  blade: "#d9d9e3",
  pistol: "#8fd0ff",
  scattergun: "#ffb37a",
  beam: "#ff6ad5",
  rocket: "#ff6a6a",
  turret: "#8dffb0",
};

export function colorForWeapon(type: string): string {
  return WEAPON_COLORS[type] ?? "#ffffff";
}
