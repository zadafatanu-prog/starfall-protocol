# NEON VAULT: SPECTRUM HEIST

Local, draft-only Roblox GUI arcade. Five sequential vaults, four enemies, Titan
boss, channelled bot-rival core stealing, workshop upgrades, complete win/loss/retry.

## Play locally
Open `game.rbxl` in Roblox Studio and press Play. Keyboard/mouse landscape target.
WASD moves, Shift dashes, E held near the ring steals. Auto-beam is enabled; Mouse1
prioritises targets near the cursor. Clear a vault to return to the workshop/select.
All gameplay numbers and simulation are owned by the server, separately per player.
No external assets, HTTP, DataStores, purchases, or persistent account state.

## Rebuild and verify
Tools installed on this host: `/home/hatch/workspace/bug-hunting/tools/bin/`.
Run `python3 tools/verify-local.py`. This compiles all src Luau, runs clean analysis,
46 simulation assertions, ten input-only campaigns, a mock client runtime smoke,
Rojo build, binary chunk/source check, and deterministic kit dossier/entry tests.

The verifier creates ONLY structural image fixtures under verification/packaging-fixture.
Those are explicitly NOT screenshots or evidence of the Roblox game's appearance.
The deliverable screenshots/ directory intentionally remains empty until Studio capture.
The final dossier cannot be valid without the owner's actual shots and Public PLAY link.

## Architecture
- GameConfig: vaults, prices, upgrades, controls/timing.
- EnemyCatalog: Shard, Drifter, Lattice, Lancer, Titan stats/silhouettes.
- GameMath: pure math, inherited steal-chance formula and timer formatting.
- VaultSimulation: deterministic server-driven movement/combat/mining/steal/progression.
- VaultServer: per-player state, validated and throttled intent remotes, snapshots.
- VaultClient: select/combat/ending screens, input, transitions and visual feedback.
- UIFactory: reused panel/label/button structure with pooled arena geometry.

Reuses HATCH & SNATCH's Rojo layout, server authority/remotes pattern, pure-math
split, UI factory and unchanged kit buildDossier pipeline. Game content is rebuilt.

See SHOT-LIST.md for captures and BUILD-REPORT.md for verified results and limits.
Nothing has been uploaded, submitted or published. PLAY.json is a template.
