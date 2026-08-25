import type { Vector2 } from "../game/types";
import { ZERO } from "../game/vector";
import type { MovementInputSource } from "./movement-input";

export type Direction = "up" | "down" | "left" | "right";

const KEY_TO_DIRECTION: Readonly<Record<string, Direction>> = {
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
};

export function directionForKey(key: string): Direction | null {
  return KEY_TO_DIRECTION[key.toLowerCase()] ?? null;
}

/** Pure: a held-direction set to a normalized movement vector. */
export function vectorFromHeldKeys(held: ReadonlySet<Direction>): Vector2 {
  let x = 0;
  let y = 0;
  if (held.has("left")) x -= 1;
  if (held.has("right")) x += 1;
  if (held.has("up")) y -= 1;
  if (held.has("down")) y += 1;
  if (x === 0 && y === 0) return ZERO;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

export function attachKeyboardMovement(target: EventTarget = window): MovementInputSource {
  const held = new Set<Direction>();

  const onKeyDown = (event: Event) => {
    const direction = directionForKey((event as KeyboardEvent).key);
    if (direction) held.add(direction);
  };
  const onKeyUp = (event: Event) => {
    const direction = directionForKey((event as KeyboardEvent).key);
    if (direction) held.delete(direction);
  };
  // A held key whose keyup never arrives (window loses focus mid-press)
  // would otherwise leave the player moving forever in one direction.
  const onBlur = () => held.clear();

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return {
    vector: () => vectorFromHeldKeys(held),
    destroy: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
