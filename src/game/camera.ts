// Camera always centered on the player, one world-unit = one CSS pixel, no
// letterboxing — the desktop viewport simply shows more world at once than
// the phone one. Difficulty parity across the two marking viewports comes
// from the spawn director being viewport-invariant (a fixed world-radius
// ring around the player), not from forcing both screens to show the same
// amount of world — see spawn/spawn-tuning.ts.

import type { Vector2 } from "./types";

export interface Camera {
  readonly centerWorld: Vector2;
  readonly viewportCssWidth: number;
  readonly viewportCssHeight: number;
}

export function worldToScreen(camera: Camera, worldPos: Vector2): Vector2 {
  return {
    x: worldPos.x - camera.centerWorld.x + camera.viewportCssWidth / 2,
    y: worldPos.y - camera.centerWorld.y + camera.viewportCssHeight / 2,
  };
}

export function screenToWorld(camera: Camera, screenPos: Vector2): Vector2 {
  return {
    x: screenPos.x + camera.centerWorld.x - camera.viewportCssWidth / 2,
    y: screenPos.y + camera.centerWorld.y - camera.viewportCssHeight / 2,
  };
}
