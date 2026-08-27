// Camera always centered on the player, no letterboxing — the desktop
// viewport simply shows more world at once than the phone one. Difficulty
// parity across the two marking viewports comes from the spawn director
// being viewport-invariant (a fixed world-radius ring around the player),
// not from forcing both screens to show the same amount of world — see
// spawn/spawn-tuning.ts. `zoom` (default 1, i.e. one world-unit = one CSS
// pixel) scales how much screen space each world-unit occupies; it never
// changes what's spawned or where anything actually is in world-space —
// purely a rendering concern.

import type { Vector2 } from "./types";

export interface Camera {
  readonly centerWorld: Vector2;
  readonly viewportCssWidth: number;
  readonly viewportCssHeight: number;
  readonly zoom?: number;
}

export function worldToScreen(camera: Camera, worldPos: Vector2): Vector2 {
  const zoom = camera.zoom ?? 1;
  return {
    x: (worldPos.x - camera.centerWorld.x) * zoom + camera.viewportCssWidth / 2,
    y: (worldPos.y - camera.centerWorld.y) * zoom + camera.viewportCssHeight / 2,
  };
}

export function screenToWorld(camera: Camera, screenPos: Vector2): Vector2 {
  const zoom = camera.zoom ?? 1;
  return {
    x: (screenPos.x - camera.viewportCssWidth / 2) / zoom + camera.centerWorld.x,
    y: (screenPos.y - camera.viewportCssHeight / 2) / zoom + camera.centerWorld.y,
  };
}

/** Scales a world-space length (a radius, a stroke width, an image's
 * dimensions) into the equivalent screen-space length under the camera's
 * current zoom. Anywhere a *size* rather than a *position* gets drawn,
 * it needs this — worldToScreen alone only relocates points. */
export function worldLengthToScreen(camera: Camera, worldLength: number): number {
  return worldLength * (camera.zoom ?? 1);
}
