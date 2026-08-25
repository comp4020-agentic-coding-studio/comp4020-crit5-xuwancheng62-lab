// The only file allowed to touch a Canvas 2D context, requestAnimationFrame,
// ResizeObserver, or the DOM directly. Everything it wires together —
// step(), the renderer, the HUD, the input sources — is either pure or takes
// its clock/DOM as an explicit dependency.

import type { Camera } from "./game/camera";
import { statsAtCharacterLevel } from "./game/leveling/player-stats";
import { createInitialGameState, type GameState } from "./game/state";
import { step } from "./game/step";
import { attachKeyboardMovement } from "./input/keyboard-source";
import { combineMovementSources } from "./input/movement-input";
import { attachPointerMovement } from "./input/pointer-source";
import { renderFrame } from "./render/canvas-renderer";
import { queryHud, updateHud } from "./render/hud";

// A backgrounded tab can hand rAF one huge elapsed gap on refocus; without a
// clamp that would spawn-storm or let a fast projectile tunnel straight
// through a target.
const MAX_DT_SECONDS = 1 / 20;

export function initGame(root: ParentNode = document): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]');
  if (!canvas) throw new Error("initGame: no [data-testid=game-canvas] found");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("initGame: 2D canvas context unavailable");

  const hud = queryHud(root);
  const restartButton = root.querySelector<HTMLButtonElement>('[data-testid="restart-button"]');

  let state: GameState = createInitialGameState((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  let viewportCssWidth = 0;
  let viewportCssHeight = 0;

  function resize(): void {
    const rect = canvas!.getBoundingClientRect();
    viewportCssWidth = rect.width;
    viewportCssHeight = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas!.width = Math.max(1, Math.round(viewportCssWidth * dpr));
    canvas!.height = Math.max(1, Math.round(viewportCssHeight * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const movement = combineMovementSources([
    attachKeyboardMovement(window),
    attachPointerMovement(canvas, {}),
  ]);

  function restart(): void {
    state = createInitialGameState((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  }
  restartButton?.addEventListener("click", restart);

  let lastTimestampMs: number | null = null;
  let animationFrameHandle = 0;

  function frame(timestampMs: number): void {
    if (lastTimestampMs === null) lastTimestampMs = timestampMs;
    const dt = Math.min(MAX_DT_SECONDS, (timestampMs - lastTimestampMs) / 1000);
    lastTimestampMs = timestampMs;

    const moveVector = movement.vector();
    state = step(state, { moveVector }, dt);

    const camera: Camera = {
      centerWorld: state.player.pos,
      viewportCssWidth,
      viewportCssHeight,
    };
    const isMoving = moveVector.x !== 0 || moveVector.y !== 0;
    renderFrame(ctx!, camera, state, isMoving);

    if (hud) updateHud(hud, state, statsAtCharacterLevel(state.xp.level).maxHealth);

    animationFrameHandle = requestAnimationFrame(frame);
  }
  animationFrameHandle = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(animationFrameHandle);
    resizeObserver.disconnect();
    movement.destroy();
    restartButton?.removeEventListener("click", restart);
  };
}
