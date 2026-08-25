# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so the deployed head is the only place a broken one shows up.

## The checks

`pnpm check` runs them, and `pnpm check:evidence` is the extra gate before you
ship. CI runs the same plus links, secrets and the deploy.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## Checks and tooling gotchas

Carried forward from last week (an instrument, same Vite/TS/oxlint/stylelint
stack) — general facts about this toolchain, not about that prototype:

- **Import paths are extensionless.** `allowImportingTsExtensions` is off, so
  `./beat-clock`, never `./beat-clock.ts`.
- **`tsconfig.json` `include` must list `src`.** The starter only includes
  `*.ts` and `spec`, so a new directory is silently untypechecked otherwise.
- **stylelint-config-standard rejects BEM.** Class names must be kebab-case, so
  no `pad__ink` or `control--loop`. It also wants `opacity` as a number (`0.4`)
  but `rgb()` alpha as a percentage (`/ 40%`), and enforces ascending
  specificity: put `:hover:not(:disabled)` *after* the plainer selectors.
- **Headless Chrome's `--window-size` is not the marking viewport.** macOS
  clamps the window, so `--window-size=390,844` renders a ~500px-wide page and
  invents overflow bugs that do not exist. To check 390x844 honestly, drive CDP
  and set `Emulation.setDeviceMetricsOverride`. Better still, open real Chrome
  DevTools at the iPhone preset and look.
- **A decorative element sized in `vw` can widen the page.** `overflow-x: clip`
  on `body` is a cheap guard against it.

## If a browser-driven check gets built this week

Last week's `pnpm playtest` (a headless-Chrome tool that drives real
interaction instead of judging a screenshot, for anything with a decidable
yes/no answer — layout overflow, an uncaught exception, a control under 44px)
doesn't carry forward as a script; its DOM assumptions were specific to that
prototype. But it earned three rules the hard way, worth keeping if a similar
tool gets built here:

- **Drive real input via CDP's `Input` domain, not `element.dispatchEvent(new
  PointerEvent(...))`.** A JS-constructed pointer event never registers as an
  "active pointer" in Chrome's real bookkeeping, so `setPointerCapture()`
  throws `NotFoundError` for it even on a bare element with no app code
  involved. Only real input — hardware, or `Input.dispatchMouseEvent`/
  `dispatchTouchEvent` — produces a pointer that capture can find.
- **A two-point "did it change" check can pass on a value that changed once
  and froze.** Sample three points and require it to keep moving, not just end
  up different from where it started.
- **Any script that spawns a headless browser needs `--mute-audio` and a
  `try/finally` (or signal handlers) around it.** A run that threw before
  reaching cleanup once left a real Chrome process — with a live
  `AudioContext` — looping sound through actual speakers for half an hour,
  caught only because someone's earbuds were still playing it. `--mute-audio`
  is the guarantee that doesn't depend on any other code running correctly.

## Audio in this repo

Carried forward from last week's instrument. This game may or may not have
any sound in it — if it doesn't, this section is dead weight and should come
out; if it does, these held up:

- **jsdom implements no Web Audio API at all.** Never construct an
  `AudioContext` at module scope — keep it lazy, inside a function, or merely
  importing the module crashes every test that touches it.
- **Create and `resume()` the context synchronously inside the
  `pointerdown`/`keydown` handler.** Any `await` before `resume()` loses the
  user-gesture flag and Safari declines to start.
- **Never `exponentialRampToValueAtTime` to zero or away from zero.** To zero
  throws `RangeError` in a browser; *from* zero throws nothing and is simply
  silent, which is far worse.
- **A source node's `start()` can only be called once.** Build a fresh node
  per trigger; never reuse one.
- **`exponentialRampToValueAtTime(0.0001, t + 0.085)` is not an 85ms decay.**
  It falls below hearing in roughly a quarter of that. Ramp to about 2% of
  peak over the length you actually want, then finish with a short linear
  fade to zero.
- **A bandpass is a quiet filter; a highpass is a loud one.** For anything
  that needs to be bright *and* present, highpass and let a separate high-Q
  band supply the pitch. **A highpass cannot make something less fizzy**
  though — it passes everything up to Nyquist; bounding the top needs a
  lowpass in series, not a lower highpass corner.
- **Measure the sound, do not guess at it.** An `OfflineAudioContext` render
  reporting peak/rms/brightness/attack/decay found a real bug that raising
  gain alone never would have: a filter was discarding most of the signal, so
  the ear-perceived level had nothing to do with the gain value.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.
