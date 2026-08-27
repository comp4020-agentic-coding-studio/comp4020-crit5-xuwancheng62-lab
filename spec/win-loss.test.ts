import { describe, expect, it } from "vitest";
import { checkEnding } from "../src/game/win-loss";

const BASE = { playerHp: 100, elapsedSeconds: 0, runLengthSeconds: 90, bossSpawned: false, bossAlive: false };

describe("checkEnding: the ordinary timer-based win (no Boss involved)", () => {
  it("keeps playing before the timer elapses", () => {
    expect(checkEnding({ ...BASE, elapsedSeconds: 89 })).toBe("playing");
  });

  it("wins once the timer elapses, as long as no Boss has ever spawned", () => {
    expect(checkEnding({ ...BASE, elapsedSeconds: 90 })).toBe("won");
  });
});

describe("checkEnding: the Boss overrides the timer entirely once it has spawned", () => {
  it("keeps playing past the old timer while the Boss is alive", () => {
    expect(checkEnding({ ...BASE, elapsedSeconds: 200, bossSpawned: true, bossAlive: true })).toBe("playing");
  });

  it("wins immediately once the Boss is no longer alive", () => {
    expect(checkEnding({ ...BASE, elapsedSeconds: 81, bossSpawned: true, bossAlive: false })).toBe("won");
  });

  it("wins on Boss death even well before the old timer would ever have fired", () => {
    expect(checkEnding({ ...BASE, elapsedSeconds: 81, runLengthSeconds: 999, bossSpawned: true, bossAlive: false })).toBe(
      "won",
    );
  });
});

describe("checkEnding: loss always takes precedence", () => {
  it("loss beats a simultaneous Boss-death win", () => {
    expect(checkEnding({ ...BASE, playerHp: 0, bossSpawned: true, bossAlive: false })).toBe("lost");
  });

  it("loss beats a simultaneous timer win", () => {
    expect(checkEnding({ ...BASE, playerHp: 0, elapsedSeconds: 90 })).toBe("lost");
  });
});
