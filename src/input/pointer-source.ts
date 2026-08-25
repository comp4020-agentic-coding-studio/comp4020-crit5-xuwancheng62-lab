// A touch/mouse drag starting anywhere on the canvas — not a fixed joystick
// zone — so it works on a 390px screen with no visible tutorial. Mirrors
// crit4's pointer-capture pattern: capture on down so a drag that leaves the
// element's box keeps tracking.

import type { Vector2 } from "../game/types";
import { ZERO } from "../game/vector";
import type { MovementInputSource } from "./movement-input";

/** Pure: origin/current -> a movement vector, dead-zoned then ramped to full
 * magnitude at maxRadiusPx, so a tiny jitter near the origin doesn't move the
 * player and a drag doesn't need to be dragged unreasonably far to be "full
 * speed". */
export function vectorFromDrag(
  origin: Vector2,
  current: Vector2,
  deadZonePx: number,
  maxRadiusPx: number,
): Vector2 {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= deadZonePx) return ZERO;
  const clampedDist = Math.min(dist, maxRadiusPx);
  const magnitude = (clampedDist - deadZonePx) / (maxRadiusPx - deadZonePx);
  return { x: (dx / dist) * magnitude, y: (dy / dist) * magnitude };
}

export interface PointerMovementOptions {
  deadZonePx?: number;
  maxRadiusPx?: number;
  /** For drawing a translucent joystick where the drag started — a free,
   * zero-text way to self-explain the mechanic. */
  onDragStart?: (origin: Vector2) => void;
  onDragMove?: (origin: Vector2, current: Vector2) => void;
  onDragEnd?: () => void;
}

export function attachPointerMovement(
  root: HTMLElement,
  opts: PointerMovementOptions = {},
): MovementInputSource {
  const deadZonePx = opts.deadZonePx ?? 8;
  const maxRadiusPx = opts.maxRadiusPx ?? 64;

  // Only the first active pointer drives movement — a second touch (e.g. a
  // stray finger) must not fight it or reset the drag origin.
  let activePointerId: number | null = null;
  let origin: Vector2 = ZERO;
  let current: Vector2 = ZERO;

  const onPointerDown = (event: PointerEvent) => {
    if (activePointerId !== null) return;
    activePointerId = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    current = origin;
    root.setPointerCapture?.(event.pointerId);
    opts.onDragStart?.(origin);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId) return;
    current = { x: event.clientX, y: event.clientY };
    opts.onDragMove?.(origin, current);
    event.preventDefault();
  };
  const endPointer = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    origin = ZERO;
    current = ZERO;
    opts.onDragEnd?.();
  };

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", endPointer);
  root.addEventListener("pointercancel", endPointer);

  return {
    vector: () => (activePointerId === null ? ZERO : vectorFromDrag(origin, current, deadZonePx, maxRadiusPx)),
    destroy: () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", endPointer);
      root.removeEventListener("pointercancel", endPointer);
    },
  };
}
