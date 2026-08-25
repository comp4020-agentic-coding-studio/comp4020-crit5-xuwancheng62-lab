import { describe, expect, it } from "vitest";
import { vectorFromHeldKeys } from "../src/input/keyboard-source";
import { vectorFromDrag } from "../src/input/pointer-source";

describe("vectorFromHeldKeys", () => {
  it("is zero when nothing is held", () => {
    expect(vectorFromHeldKeys(new Set())).toEqual({ x: 0, y: 0 });
  });

  it("moves in the single held direction", () => {
    expect(vectorFromHeldKeys(new Set(["right"]))).toEqual({ x: 1, y: 0 });
    expect(vectorFromHeldKeys(new Set(["up"]))).toEqual({ x: 0, y: -1 });
  });

  it("normalizes a diagonal so it isn't faster than a straight direction", () => {
    const diagonal = vectorFromHeldKeys(new Set(["right", "down"]));
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
  });

  it("cancels out opposite directions held at once", () => {
    expect(vectorFromHeldKeys(new Set(["left", "right"]))).toEqual({ x: 0, y: 0 });
  });
});

describe("vectorFromDrag", () => {
  const origin = { x: 100, y: 100 };

  it("is zero within the dead zone", () => {
    expect(vectorFromDrag(origin, { x: 103, y: 100 }, 8, 64)).toEqual({ x: 0, y: 0 });
  });

  it("points in the drag direction once past the dead zone", () => {
    const result = vectorFromDrag(origin, { x: 200, y: 100 }, 8, 64);
    expect(result.x).toBeGreaterThan(0);
    expect(result.y).toBeCloseTo(0);
  });

  it("reaches full magnitude at maxRadiusPx and clamps beyond it", () => {
    const atMax = vectorFromDrag(origin, { x: 164, y: 100 }, 8, 64);
    expect(Math.hypot(atMax.x, atMax.y)).toBeCloseTo(1);
    const wayPast = vectorFromDrag(origin, { x: 1000, y: 100 }, 8, 64);
    expect(Math.hypot(wayPast.x, wayPast.y)).toBeCloseTo(1);
  });

  it("ramps smoothly between the dead zone and max radius, not a hard jump", () => {
    const near = vectorFromDrag(origin, { x: 120, y: 100 }, 8, 64);
    const far = vectorFromDrag(origin, { x: 150, y: 100 }, 8, 64);
    expect(Math.hypot(far.x, far.y)).toBeGreaterThan(Math.hypot(near.x, near.y));
  });
});
