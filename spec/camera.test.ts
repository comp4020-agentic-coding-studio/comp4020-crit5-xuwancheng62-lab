import { describe, expect, it } from "vitest";
import { screenToWorld, worldLengthToScreen, worldToScreen, type Camera } from "../src/game/camera";

const BASE_CAMERA: Camera = { centerWorld: { x: 100, y: -50 }, viewportCssWidth: 800, viewportCssHeight: 600 };

describe("worldToScreen: zoom defaults to 1 (unchanged behavior for any Camera that omits it)", () => {
  it("matches the original no-zoom formula", () => {
    const screen = worldToScreen(BASE_CAMERA, { x: 120, y: -30 });
    expect(screen).toEqual({ x: 20 + 400, y: 20 + 300 });
  });

  it("the camera's own center always maps to the exact viewport center", () => {
    const screen = worldToScreen(BASE_CAMERA, BASE_CAMERA.centerWorld);
    expect(screen).toEqual({ x: 400, y: 300 });
  });
});

describe("worldToScreen: zoom scales distance from the camera's center", () => {
  it("a point 10 world-units right of center lands 15 screen-px right of center at zoom 1.5", () => {
    const zoomed: Camera = { ...BASE_CAMERA, zoom: 1.5 };
    const screen = worldToScreen(zoomed, { x: BASE_CAMERA.centerWorld.x + 10, y: BASE_CAMERA.centerWorld.y });
    expect(screen.x).toBeCloseTo(400 + 15);
    expect(screen.y).toBeCloseTo(300);
  });

  it("the camera's own center still maps to the viewport center regardless of zoom", () => {
    const zoomed: Camera = { ...BASE_CAMERA, zoom: 3 };
    expect(worldToScreen(zoomed, BASE_CAMERA.centerWorld)).toEqual({ x: 400, y: 300 });
  });
});

describe("worldLengthToScreen", () => {
  it("passes a length through unchanged at the default zoom", () => {
    expect(worldLengthToScreen(BASE_CAMERA, 42)).toBe(42);
  });

  it("scales a length by the camera's zoom", () => {
    expect(worldLengthToScreen({ ...BASE_CAMERA, zoom: 1.5 }, 42)).toBeCloseTo(63);
  });
});

describe("screenToWorld: the exact inverse of worldToScreen under any zoom", () => {
  it("round-trips a world position through worldToScreen and back", () => {
    for (const zoom of [1, 1.5, 3]) {
      const camera: Camera = { ...BASE_CAMERA, zoom };
      const original = { x: -40, y: 275 };
      const roundTripped = screenToWorld(camera, worldToScreen(camera, original));
      expect(roundTripped.x).toBeCloseTo(original.x);
      expect(roundTripped.y).toBeCloseTo(original.y);
    }
  });
});
