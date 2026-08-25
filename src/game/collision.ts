import type { Circle, Vector2 } from "./types";
import { distanceSquared, lengthSquared, subtract } from "./vector";

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const radiusSum = a.radius + b.radius;
  return distanceSquared(a.pos, b.pos) <= radiusSum * radiusSum;
}

/** The closest point on segment a-b to `point`. */
export function closestPointOnSegment(a: Vector2, b: Vector2, point: Vector2): Vector2 {
  const ab = subtract(b, a);
  const abLengthSquared = lengthSquared(ab);
  if (abLengthSquared === 0) return a;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / abLengthSquared),
  );
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

/** For Beam: a persistent line, not a moving circle — hit-test by distance. */
export function segmentCircleDistanceSquared(a: Vector2, b: Vector2, point: Vector2): number {
  return distanceSquared(closestPointOnSegment(a, b, point), point);
}

export function segmentIntersectsCircle(a: Vector2, b: Vector2, circle: Circle): boolean {
  return segmentCircleDistanceSquared(a, b, circle.pos) <= circle.radius * circle.radius;
}
