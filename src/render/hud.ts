// DOM overlay for health/timer/loadout/end-screen — simpler and more
// accessible than drawing text on canvas. Reads GameState; never mutates it.

import { RUN_LENGTH_SECONDS } from "../game/spawn/spawn-tuning";
import type { GameState } from "../game/state";

export interface HudElements {
  readonly healthFill: HTMLElement;
  readonly timer: HTMLElement;
  readonly loadoutSlots: readonly HTMLElement[];
  readonly endScreen: HTMLElement;
  readonly endMessage: HTMLElement;
}

export function queryHud(root: ParentNode): HudElements | null {
  const healthFill = root.querySelector<HTMLElement>('[data-testid="health-fill"]');
  const timer = root.querySelector<HTMLElement>('[data-testid="timer"]');
  const endScreen = root.querySelector<HTMLElement>('[data-testid="end-screen"]');
  const endMessage = root.querySelector<HTMLElement>('[data-testid="end-message"]');
  const loadoutSlots = [0, 1, 2].map((i) =>
    root.querySelector<HTMLElement>(`[data-testid="loadout-slot-${i}"]`),
  );
  if (!healthFill || !timer || !endScreen || !endMessage || loadoutSlots.some((s) => !s)) return null;
  return { healthFill, timer, loadoutSlots: loadoutSlots as HTMLElement[], endScreen, endMessage };
}

export function updateHud(hud: HudElements, state: GameState, maxHealth: number): void {
  const healthFraction = Math.max(0, Math.min(1, state.player.hp / maxHealth));
  hud.healthFill.style.width = `${(healthFraction * 100).toFixed(1)}%`;

  const remaining = Math.max(0, RUN_LENGTH_SECONDS - state.elapsedSeconds);
  hud.timer.textContent = remaining.toFixed(0);

  hud.loadoutSlots.forEach((el, index) => {
    const slot = state.loadout.slots[index];
    if (!slot) {
      el.removeAttribute("data-weapon");
      el.textContent = "";
      return;
    }
    el.dataset.weapon = slot.type;
    el.textContent = String(slot.level);
  });

  if (state.ending === "playing") {
    hud.endScreen.hidden = true;
  } else {
    hud.endScreen.hidden = false;
    hud.endMessage.textContent = state.ending === "won" ? "You survived." : "You fell.";
  }
}
