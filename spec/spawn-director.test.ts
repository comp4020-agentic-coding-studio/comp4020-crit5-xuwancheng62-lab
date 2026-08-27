import { describe, expect, it } from "vitest";
import { createRng } from "../src/game/rng";
import {
  DEFAULT_SPAWN_TUNING,
  type SpawnTuning,
} from "../src/game/spawn/spawn-tuning";
import {
  INITIAL_SPAWN_DIRECTOR_STATE,
  decideSpawns,
} from "../src/game/spawn/spawn-director";
import { distance } from "../src/game/vector";
import { WORLD_RADIUS } from "../src/game/world-bounds";

const PLAYER_POS = { x: 0, y: 0 };

describe("decideSpawns: cadence", () => {
  it("spawns immediately at the start of a run — the opening screen needs an enemy already approaching", () => {
    const result = decideSpawns(
      INITIAL_SPAWN_DIRECTOR_STATE,
      0,
      0,
      PLAYER_POS,
      DEFAULT_SPAWN_TUNING,
      createRng(1),
    );
    expect(result.spawns).toHaveLength(1);
  });

  it("spawns nothing before a scheduled future spawn time has arrived", () => {
    const result = decideSpawns(
      { nextSpawnAt: 5 },
      2,
      0,
      PLAYER_POS,
      DEFAULT_SPAWN_TUNING,
      createRng(1),
    );
    expect(result.spawns).toHaveLength(0);
  });

  it("spawns exactly one enemy once nextSpawnAt has passed", () => {
    const result = decideSpawns(
      { nextSpawnAt: 0 },
      0.01,
      0,
      PLAYER_POS,
      DEFAULT_SPAWN_TUNING,
      createRng(1),
    );
    expect(result.spawns).toHaveLength(1);
  });

  it("schedules the next spawn strictly after this one", () => {
    const result = decideSpawns(
      { nextSpawnAt: 0 },
      1,
      0,
      PLAYER_POS,
      DEFAULT_SPAWN_TUNING,
      createRng(1),
    );
    expect(result.nextState.nextSpawnAt).toBeGreaterThan(1);
  });

  it("stops spawning once the alive cap is reached", () => {
    const result = decideSpawns(
      { nextSpawnAt: 0 },
      5,
      DEFAULT_SPAWN_TUNING.maxAliveEnemiesAt(5),
      PLAYER_POS,
      DEFAULT_SPAWN_TUNING,
      createRng(1),
    );
    expect(result.spawns).toHaveLength(0);
  });
});

describe("decideSpawns: which kinds are available", () => {
  it("is rusher-only before the shooter/tank introduction times", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const result = decideSpawns(
        { nextSpawnAt: 0 },
        1,
        0,
        PLAYER_POS,
        DEFAULT_SPAWN_TUNING,
        createRng(seed),
      );
      expect(result.spawns.every((s) => s.kind === "rusher")).toBe(true);
    }
  });

  it("can produce a shooter once past shooterIntroducedAtSeconds", () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 50; seed += 1) {
      const result = decideSpawns(
        { nextSpawnAt: 0 },
        DEFAULT_SPAWN_TUNING.shooterIntroducedAtSeconds + 1,
        0,
        PLAYER_POS,
        DEFAULT_SPAWN_TUNING,
        createRng(seed),
      );
      for (const spawn of result.spawns) kinds.add(spawn.kind);
    }
    expect(kinds.has("shooter")).toBe(true);
    expect(kinds.has("tank")).toBe(false); // not introduced yet at this elapsed time
  });

  it("can produce a tank once past tankIntroducedAtSeconds", () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 50; seed += 1) {
      const result = decideSpawns(
        { nextSpawnAt: 0 },
        DEFAULT_SPAWN_TUNING.tankIntroducedAtSeconds + 1,
        0,
        PLAYER_POS,
        DEFAULT_SPAWN_TUNING,
        createRng(seed),
      );
      for (const spawn of result.spawns) kinds.add(spawn.kind);
    }
    expect(kinds.has("tank")).toBe(true);
  });
});

describe("decideSpawns: viewport independence", () => {
  it("always spawns exactly spawnRingRadius from the player, regardless of where the player is (within the map)", () => {
    const tuning: SpawnTuning = DEFAULT_SPAWN_TUNING;
    // Comfortably inside WORLD_RADIUS, so the boundary clamp never kicks in
    // here — that's covered separately below.
    for (const playerPos of [{ x: 0, y: 0 }, { x: 150, y: -90 }, { x: -200, y: 100 }]) {
      const result = decideSpawns(
        { nextSpawnAt: 0 },
        1,
        0,
        playerPos,
        tuning,
        createRng(7),
      );
      for (const spawn of result.spawns) {
        expect(distance(spawn.pos, playerPos)).toBeCloseTo(tuning.spawnRingRadius);
      }
    }
  });
});

describe("decideSpawns: the map boundary applies to spawns too", () => {
  it("never spawns an enemy beyond WORLD_RADIUS, even when the ring around the player would reach past it", () => {
    const farPlayerPos = { x: WORLD_RADIUS - 50, y: 0 }; // near the edge
    for (let seed = 0; seed < 30; seed += 1) {
      const result = decideSpawns(
        { nextSpawnAt: 0 },
        1,
        0,
        farPlayerPos,
        DEFAULT_SPAWN_TUNING,
        createRng(seed),
      );
      for (const spawn of result.spawns) {
        expect(distance(spawn.pos, { x: 0, y: 0 })).toBeLessThanOrEqual(WORLD_RADIUS);
      }
    }
  });
});

describe("decideSpawns: determinism", () => {
  it("the same seed and inputs produce the same spawn every time", () => {
    const run = () =>
      decideSpawns({ nextSpawnAt: 0 }, 25, 0, PLAYER_POS, DEFAULT_SPAWN_TUNING, createRng(42));
    expect(run().spawns).toEqual(run().spawns);
  });
});
