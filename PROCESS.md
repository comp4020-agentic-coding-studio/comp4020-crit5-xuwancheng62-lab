# Process overview

A reading-guide to how the work came together.

## What I built

**Sole Survivor**, a top-down five-minute survival shooter: pick up weapons
from fallen enemies, the first three distinct types you find lock in as your
build for the run, repeat pickups level them up, and the goal is to survive
an escalating wave of enemies and then kill the Boss that appears partway
through. Implementation (game loop, weapons, enemies, collision, progression,
tests) was mine and Claude's; character/enemy/environment art came from
Codex; music and sound effects came from Gemini. My own job was deciding the
mechanics, routing work to the right tool, integrating what came back, and
playtesting the combined result until it actually felt right.

## The moments that mattered

1. **The bot was winning almost every run.** A flee-heuristic bot simulated
   against the spawn/damage tuning won 96.4% of the time — nowhere near the
   "real coin flip" target. Rather than guess at new numbers, I iterated
   spawn ramp, spawn floor and contact damage against `pnpm simulate` four
   times in a row, checking win rate *and* loss timing (losses used to
   cluster only in the run's final third; now they spread across the whole
   run) after each change, landing at 51.5% over 800 simulated runs.
   [`085a06f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-xuwancheng62-lab/commit/085a06f478155f4502b75f295b1782ae5a41c6d7)

2. **The opening was killing new players before they got a weapon.** Fist —
   the only attack you start with — had a short 34-unit range and no
   knockback, so an early Rusher swarm could box you in before you ever
   found something better. Instead of redesigning Fist, I widened its range
   to 42 and gave it real knockback (60), and made the very first kill of a
   run always drop a weapon instead of leaving it to the normal drop-chance
   roll. Verified with the existing weapon-pickup tests plus an actual
   playthrough of the first 20 seconds.
   [`7a02bcb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-xuwancheng62-lab/commit/7a02bcbcb9fc754af5b1adae7872f984fd83c5fc)

3. **The Beam weapon was correct and still looked broken.** Its damage
   always landed on the right line, but the *drawn* line was recomputed
   fresh every render frame from wherever the player and nearest enemy
   currently were — so if either moved during the brief flash, the line
   visibly snapped to a different angle than whatever it actually hit. I
   locked the muzzle position, direction and endpoint into state the exact
   instant it fires, and had the renderer draw that one fixed line for the
   whole flash instead of recomputing it. Verified with a test that moves
   the target mid-flash and asserts the drawn line doesn't change.
   [`7a02bcb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-xuwancheng62-lab/commit/7a02bcbcb9fc754af5b1adae7872f984fd83c5fc)

4. **Zooming in for readability made the camera nauseating.** Enemies,
   projectiles and pickups were unreadable at the original camera scale, but
   zooming in and locking the camera to the player's exact position every
   frame turned every small dodge into a screen-wide jolt. Rather than
   revert the zoom, I added a dead zone (the camera only moves once the
   player leaves roughly the center 10% of the screen) with critically
   damped smoothing, so it catches up without overshoot or bounce. Verified
   with unit tests on the dead zone and the no-overshoot property, then
   confirmed the "readable but not dizzying" feel by playing it.
   [`7a02bcb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-xuwancheng62-lab/commit/7a02bcbcb9fc754af5b1adae7872f984fd83c5fc)

Moments 2-4 share one commit hash because that push landed as a single large
commit rather than several small ones — a real gap in this week's process
(smaller, more frequent commits would make the evidence trail sharper) that
I'm carrying into the next deliverable, not papering over here.
