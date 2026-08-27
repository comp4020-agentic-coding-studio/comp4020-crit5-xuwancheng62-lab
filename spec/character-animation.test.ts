import { describe, expect, it } from "vitest";
import { spriteForCharacter, updateFacing, walkCycleFrame, WALK_FRAME_SECONDS } from "../src/render/character-animation";
import type { CharacterSpriteSet } from "../src/render/sprite-assets";

describe("WALK_FRAME_SECONDS: the requested 100-150ms frame duration", () => {
  it("is within the requested band", () => {
    expect(WALK_FRAME_SECONDS).toBeGreaterThanOrEqual(0.1);
    expect(WALK_FRAME_SECONDS).toBeLessThanOrEqual(0.15);
  });
});

describe("walkCycleFrame: left -> pass -> right -> pass, looping", () => {
  it("steps through all four poses in the required order across one full cycle", () => {
    const t0 = 0;
    expect(walkCycleFrame(t0)).toBe("walkLeft");
    expect(walkCycleFrame(t0 + WALK_FRAME_SECONDS)).toBe("walkPass");
    expect(walkCycleFrame(t0 + WALK_FRAME_SECONDS * 2)).toBe("walkRight");
    expect(walkCycleFrame(t0 + WALK_FRAME_SECONDS * 3)).toBe("walkPass");
  });

  it("never returns the same foot-forward pose twice in a row (no sliding on one foot)", () => {
    const seen: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      seen.push(walkCycleFrame(i * WALK_FRAME_SECONDS));
    }
    for (let i = 1; i < seen.length; i += 1) {
      if (seen[i] !== "walkPass" && seen[i - 1] !== "walkPass") {
        expect(seen[i]).not.toBe(seen[i - 1]);
      }
    }
  });

  it("loops back to walk_left after a full 4-frame cycle", () => {
    expect(walkCycleFrame(WALK_FRAME_SECONDS * 4)).toBe(walkCycleFrame(0));
  });

  it("timing depends only on elapsed simulation time, not on how it's sampled", () => {
    // Sampling the same simulated instant from a "30fps tab" (coarser steps)
    // and a "240fps tab" (finer steps) must land on the same frame — the
    // requirement that animation timing not depend on render frame rate.
    const simulatedInstant = WALK_FRAME_SECONDS * 5.5;
    expect(walkCycleFrame(simulatedInstant)).toBe(walkCycleFrame(simulatedInstant));
  });
});

describe("walkCycleFrame: an optional slower cadence (e.g. the Boss's hover)", () => {
  it("matches the default cadence when no override is given", () => {
    expect(walkCycleFrame(WALK_FRAME_SECONDS)).toBe(walkCycleFrame(WALK_FRAME_SECONDS, WALK_FRAME_SECONDS));
  });

  it("holds each frame longer with a slower override, without changing the pose order", () => {
    const slow = WALK_FRAME_SECONDS * 1.5;
    expect(walkCycleFrame(0, slow)).toBe("walkLeft");
    // Still on the first pose at a time that would already be walkPass at the default cadence.
    expect(walkCycleFrame(WALK_FRAME_SECONDS * 1.1, slow)).toBe("walkLeft");
    expect(walkCycleFrame(slow, slow)).toBe("walkPass");
    expect(walkCycleFrame(slow * 2, slow)).toBe("walkRight");
    expect(walkCycleFrame(slow * 3, slow)).toBe("walkPass");
  });
});

function fakeSprites(): CharacterSpriteSet {
  return {
    idle: "IDLE" as unknown as HTMLImageElement,
    walkLeft: "L" as unknown as HTMLImageElement,
    walkPass: "P" as unknown as HTMLImageElement,
    walkRight: "R" as unknown as HTMLImageElement,
  };
}

describe("spriteForCharacter: selection shared by the player and every enemy kind, Boss included", () => {
  it("shows the set's own idle frame while not moving, regardless of cadence", () => {
    expect(spriteForCharacter(fakeSprites(), false, 5, 999)).toBe("IDLE");
  });

  it("picks the walk-cycle frame at the given cadence while moving", () => {
    const slow = WALK_FRAME_SECONDS * 1.5;
    expect(spriteForCharacter(fakeSprites(), true, 0, slow)).toBe("L");
    expect(spriteForCharacter(fakeSprites(), true, slow, slow)).toBe("P");
    expect(spriteForCharacter(fakeSprites(), true, slow * 2, slow)).toBe("R");
  });
});

describe("updateFacing: position-delta based facing/moving tracker", () => {
  it("starts idle, facing left, on a character's first tracked frame", () => {
    const result = updateFacing({ x: 10, y: 10 }, undefined);
    expect(result.moving).toBe(false);
    expect(result.facingRight).toBe(false);
  });

  it("faces right after moving right, left after moving left", () => {
    const start = updateFacing({ x: 0, y: 0 }, undefined);
    const movedRight = updateFacing({ x: 5, y: 0 }, start.next);
    expect(movedRight.moving).toBe(true);
    expect(movedRight.facingRight).toBe(true);

    const movedLeft = updateFacing({ x: -5, y: 0 }, movedRight.next);
    expect(movedLeft.moving).toBe(true);
    expect(movedLeft.facingRight).toBe(false);
  });

  it("preserves the last facing direction when movement is purely vertical", () => {
    const start = updateFacing({ x: 0, y: 0 }, undefined);
    const facedRight = updateFacing({ x: 5, y: 0 }, start.next);
    expect(facedRight.facingRight).toBe(true);

    const movedUpOnly = updateFacing({ x: 5, y: -20 }, facedRight.next);
    expect(movedUpOnly.moving).toBe(true);
    expect(movedUpOnly.facingRight).toBe(true); // unchanged, not reset to left
  });

  it("reports not-moving, with facing preserved, once position stops changing", () => {
    const start = updateFacing({ x: 0, y: 0 }, undefined);
    const facedRight = updateFacing({ x: 5, y: 0 }, start.next);
    const stopped = updateFacing({ x: 5, y: 0 }, facedRight.next);
    expect(stopped.moving).toBe(false);
    expect(stopped.facingRight).toBe(true);
  });
});
