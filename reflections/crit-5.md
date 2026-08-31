# Crit 5 reflection

**What was the breakthrough that moved the work forward?**

Moving from one agent to coordinating several with different strengths.
Claude handled implementation — game loop, weapons, enemies, collision,
progression, tests, integration. Codex produced the character/enemy/
environment art. Gemini produced music and sound effects. That split changed
my own job: I was no longer asking one agent to "make a game," I was
deciding the mechanics, routing each piece to the right tool, moving assets
between them, and testing the integrated result. None of the three had
responsibility for whether the whole thing cohered — that was mine. The
real breakthrough wasn't that three agents produce more output than one; it
was realising orchestration itself was the skill: deciding what to build,
who builds which piece, how the pieces fit, and when to push back.

**What did this work change about who I want to be as a software developer?**

It sharpened the line between technically correct and actually good. The
Beam dealt damage correctly while its visual line drifted independently; the
camera followed the player's coordinates correctly while feeling nauseating
to actually use. Tests caught the first kind of problem; only playing the
game caught the second. I don't want to be a developer who hands off one
big task and accepts whatever comes back — I want to be able to decompose a
project, pick the right tool for each part, define clean boundaries between
them, and be the one who notices when a technically correct piece doesn't
actually serve the player, and pushes until it does.
