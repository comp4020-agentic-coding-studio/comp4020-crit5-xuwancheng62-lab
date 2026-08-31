// Runs the REAL game logic — the same step() the browser calls every frame —
// thousands of ticks per second, with no browser at all. This is only
// possible because src/game/ is deliberately free of any DOM/Canvas/
// AudioContext dependency: step() is a plain function of its inputs, so
// Node can call it directly, the same way it calls any other function.
//
// Why this exists: pacing (when Shooter/Tank appear, how fast enemies pile
// up and whether the starting weapon is too weak or too strong) can only really be
// judged by playing — but "does anyone ever win, does everyone die in the
// first 5 seconds, does the run end at all" is a much cheaper question this
// can answer BEFORE opening a browser. It is a pre-check, not a substitute
// for the human playtest the spec explicitly requires — a bot can tell you
// a run is survivable, never that it's fun.
//
//   node scripts/simulate-runs.ts [runCount]
//
// The bot's policy is deliberately simple (flee the nearest threat, or seek
// the nearest pickup if nothing is close): it approximates "a careful
// player trying to survive", not optimal play, so treat its win rate as a
// floor, not a ceiling.

import { findNearestEnemy } from "../src/game/entities/enemies";
import { RUN_LENGTH_SECONDS } from "../src/game/spawn/spawn-tuning";
import { createInitialGameState, type GameState } from "../src/game/state";
import { step } from "../src/game/step";
import type { Vector2 } from "../src/game/types";
import { distance, normalize, subtract } from "../src/game/vector";

const DT = 1 / 60;
const MAX_SECONDS = RUN_LENGTH_SECONDS + 5; // small buffer past the win line
const FLEE_DISTANCE = 70;
const SEEK_RADIUS = 260;

function decideMoveVector(state: GameState): Vector2 {
  const nearestEnemy = findNearestEnemy(state.player.pos, state.enemies);
  if (nearestEnemy && distance(state.player.pos, nearestEnemy.pos) < FLEE_DISTANCE) {
    return normalize(subtract(state.player.pos, nearestEnemy.pos));
  }

  let nearestPickupPos: Vector2 | null = null;
  let nearestPickupDistance = Infinity;
  for (const pickup of state.pickups) {
    const d = distance(state.player.pos, pickup.pos);
    if (d < nearestPickupDistance) {
      nearestPickupDistance = d;
      nearestPickupPos = pickup.pos;
    }
  }
  if (nearestPickupPos && nearestPickupDistance < SEEK_RADIUS) {
    return normalize(subtract(nearestPickupPos, state.player.pos));
  }

  return { x: 0, y: 0 };
}

interface RunResult {
  seed: number;
  ending: GameState["ending"];
  survivedSeconds: number;
  level: number;
  loadout: string;
}

function simulateOneRun(seed: number): RunResult {
  let state = createInitialGameState(seed);
  const maxTicks = Math.ceil(MAX_SECONDS / DT);
  for (let tick = 0; tick < maxTicks && state.ending === "playing"; tick += 1) {
    state = step(state, { moveVector: decideMoveVector(state) }, DT);
  }
  return {
    seed,
    ending: state.ending,
    survivedSeconds: state.elapsedSeconds,
    level: state.xp.level,
    loadout: state.loadout.slots.map((s) => `${s.type}${s.level}`).join(",") || "(empty)",
  };
}

const runCount = Number(process.argv[2] ?? 200);
const results: RunResult[] = [];
for (let seed = 0; seed < runCount; seed += 1) results.push(simulateOneRun(seed));

const wins = results.filter((r) => r.ending === "won");
const losses = results.filter((r) => r.ending === "lost");
const neverEnded = results.filter((r) => r.ending === "playing");

const pct = (n: number) => `${((100 * n) / results.length).toFixed(1)}%`;
const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);

console.log(`\n${results.length} simulated runs, bot policy (not optimal play)`);
console.log("-".repeat(50));
console.log(`won:  ${wins.length} (${pct(wins.length)})`);
console.log(`lost: ${losses.length} (${pct(losses.length)})`);
if (neverEnded.length > 0) {
  console.log(
    `⚠ ${neverEnded.length} run(s) never reached an ending within ${MAX_SECONDS}s — ` +
      `checkEnding() or MAX_SECONDS may be wrong, this should not happen`,
  );
}
console.log(`average survival: ${avg(results.map((r) => r.survivedSeconds)).toFixed(1)}s`);
console.log(`average level reached: ${avg(results.map((r) => r.level)).toFixed(2)}`);

if (losses.length > 0) {
  const lossTimes = losses.map((r) => r.survivedSeconds).sort((a, b) => a - b);
  const p50 = lossTimes[Math.floor(lossTimes.length / 2)];
  console.log(
    `loss survival times: min=${lossTimes[0].toFixed(1)}s p50=${p50.toFixed(1)}s max=${lossTimes[lossTimes.length - 1].toFixed(1)}s`,
  );
}

const noWeaponFound = results.filter((r) => r.loadout === "(empty)").length;
if (noWeaponFound > 0) {
  console.log(`⚠ ${noWeaponFound} run(s) ended with no real weapon ever found — drop rate/seek radius may be too stingy`);
}
console.log("");
