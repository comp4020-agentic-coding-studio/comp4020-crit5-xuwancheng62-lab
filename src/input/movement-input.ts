// One interface, multiple sources — mirrors crit4's pad-controller.ts
// pattern of unifying keyboard/pointer input behind a single shape rather
// than letting the game loop know which device is in play.

import type { Vector2 } from "../game/types";

export interface MovementInputSource {
  vector(): Vector2;
  destroy(): void;
}

/** The last source reporting a nonzero vector wins, so touch and keyboard
 * never fight for control if both happen to be active. */
export function combineMovementSources(sources: readonly MovementInputSource[]): MovementInputSource {
  return {
    vector(): Vector2 {
      let result: Vector2 = { x: 0, y: 0 };
      for (const source of sources) {
        const v = source.vector();
        if (v.x !== 0 || v.y !== 0) result = v;
      }
      return result;
    },
    destroy() {
      for (const source of sources) source.destroy();
    },
  };
}
