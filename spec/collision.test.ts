import { describe, expect, it } from "vitest";
import {
  circlesOverlap,
  closestPointOnSegment,
  segmentCircleDistanceSquared,
  segmentIntersectsCircle,
} from "../src/game/collision";

describe("circlesOverlap", () => {
  it("is true when circles overlap", () => {
    expect(circlesOverlap({ pos: { x: 0, y: 0 }, radius: 5 }, { pos: { x: 8, y: 0 }, radius: 5 })).toBe(
      true,
    );
  });

  it("is true exactly at the touching boundary", () => {
    expect(circlesOverlap({ pos: { x: 0, y: 0 }, radius: 5 }, { pos: { x: 10, y: 0 }, radius: 5 })).toBe(
      true,
    );
  });

  it("is false when clearly apart", () => {
    expect(circlesOverlap({ pos: { x: 0, y: 0 }, radius: 5 }, { pos: { x: 100, y: 0 }, radius: 5 })).toBe(
      false,
    );
  });
});

describe("closestPointOnSegment", () => {
  it("returns the perpendicular projection when it falls within the segment", () => {
    const closest = closestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 3 });
    expect(closest).toEqual({ x: 5, y: 0 });
  });

  it("clamps to an endpoint when the projection falls beyond the segment", () => {
    expect(closestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -5, y: 3 })).toEqual({
      x: 0,
      y: 0,
    });
    expect(closestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 15, y: 3 })).toEqual({
      x: 10,
      y: 0,
    });
  });

  it("degenerates to the single point when the segment has zero length", () => {
    expect(closestPointOnSegment({ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 0, y: 0 })).toEqual({
      x: 3,
      y: 3,
    });
  });
});

describe("segmentCircleDistanceSquared / segmentIntersectsCircle — Beam's hit test", () => {
  it("is zero for a point sitting on the segment", () => {
    expect(segmentCircleDistanceSquared({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 })).toBe(0);
  });

  it("intersects a circle straddling the segment", () => {
    const beamStart = { x: 0, y: 0 };
    const beamEnd = { x: 100, y: 0 };
    expect(segmentIntersectsCircle(beamStart, beamEnd, { pos: { x: 50, y: 3 }, radius: 5 })).toBe(
      true,
    );
  });

  it("does not intersect a circle well clear of the segment", () => {
    const beamStart = { x: 0, y: 0 };
    const beamEnd = { x: 100, y: 0 };
    expect(segmentIntersectsCircle(beamStart, beamEnd, { pos: { x: 50, y: 50 }, radius: 5 })).toBe(
      false,
    );
  });

  it("only intersects an enemy near the endpoints if within radius of the endpoint, not the infinite line", () => {
    const beamStart = { x: 0, y: 0 };
    const beamEnd = { x: 100, y: 0 };
    // Far past the end of the beam, still "on the line" it travels along —
    // must NOT count as a hit, or Beam's range would be unbounded.
    expect(segmentIntersectsCircle(beamStart, beamEnd, { pos: { x: 200, y: 0 }, radius: 5 })).toBe(
      false,
    );
  });
});
