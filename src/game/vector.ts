import type { Vector2 } from "./types";

export const ZERO: Vector2 = { x: 0, y: 0 };

export function vec(x: number, y: number): Vector2 {
  return { x, y };
}

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vector2, s: number): Vector2 {
  return { x: v.x * s, y: v.y * s };
}

export function lengthSquared(v: Vector2): number {
  return v.x * v.x + v.y * v.y;
}

export function length(v: Vector2): number {
  return Math.sqrt(lengthSquared(v));
}

export function distanceSquared(a: Vector2, b: Vector2): number {
  return lengthSquared(subtract(a, b));
}

export function distance(a: Vector2, b: Vector2): number {
  return Math.sqrt(distanceSquared(a, b));
}

/** The zero vector normalizes to itself rather than NaN/Infinity. */
export function normalize(v: Vector2): Vector2 {
  const len = length(v);
  if (len === 0) return ZERO;
  return { x: v.x / len, y: v.y / len };
}

export function clampLength(v: Vector2, max: number): Vector2 {
  const len = length(v);
  if (len <= max || len === 0) return v;
  return scale(v, max / len);
}

export function lerp(a: Vector2, b: Vector2, t: number): Vector2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function fromAngle(radians: number, magnitude = 1): Vector2 {
  return { x: Math.cos(radians) * magnitude, y: Math.sin(radians) * magnitude };
}

export function angleOf(v: Vector2): number {
  return Math.atan2(v.y, v.x);
}

/** Rotate `v` by `radians`, around the origin. */
export function rotate(v: Vector2, radians: number): Vector2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}
