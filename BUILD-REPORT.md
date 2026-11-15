# BUILD REPORT — NEON VAULT: SPECTRUM HEIST

Draft built locally on 2026-11-15, starting ~23:24 WIB. Verification completed
~23:49 WIB, within the requested ~40-minute build window.
Repository: /home/hatch/workspace/makefun/roblox-neon-vault/

## Delivered

- game.rbxl built by Rojo; src/shared + src/server + src/client, seven Luau scripts.
- Five sequential vaults: Crimson, Amber, Emerald, Azure, Violet. Shard fees,
  kill goals, extraction bonuses, next-gate reserve and full heal between vaults.
- Four enemy classes: chasing Shard, weaving Drifter, shooting Lattice, charging
  Lancer; differing HP/speed/reward/silhouette/colour.
- Violet Titan: three HP phases, rotating radial bullet rings, increasing attack
  frequency and speed, minion spawns. Defeating it after four clears wins.
- WASD movement, invulnerable Shift dash with cooldown, automatic beam and mining;
  Mouse1 prioritises cursor-near targets. Shard pickups and kill multiplier.
- Rival cores are NPC vault cores, NOT other players' property. Hold E nearby for
  two seconds; rarity reduces success odds, failure cooldown, movement out of range
  or damage interrupts, each core can be taken once. Grants shards and hull repair.
- Workshop beam damage, dash recharge, pickup magnet and max hull upgrades. Prices
  increase by level; purchase cannot consume the next gate's reserved fee.
- Hull zero -> Defeat -> RETRY; all vaults + Titan -> Victory -> PLAY AGAIN.
- Five-card cover with title gradient, beam/prism motif, threat bars, lock states,
  launch controls, workshop and hints. Grid/stars, beams, hit flashes, damage and
  shard numbers, steal bar, dash trail, shake, and screen fade transitions.
- Server owns movement, enemies, bullets, shards, hull, purchases, channel, boss
  health and progression. Client only sends finite validated intent and renders
  snapshots. Input/action remotes throttled; no client reward/HP parameters.
- PLAY.json intentionally template zeros. SHOT-LIST.md specifies four actual
  Studio captures, each <=200 KiB. README includes rebuild and test commands.

Reused HATCH & SNATCH's Rojo project/layout, remotes/state architecture, math
separation, steal formula/timer helper, panel/label/button factory structure and
unchanged kit packaging pipeline. Rebuilt its game content rather than copying
pets or old gameplay. New git repository, no remote configured.

## Verified with real local execution

Run: `python3 tools/verify-local.py`
Evidence: verification/test-results.json, verification/binary-check.json,
verification/client-smoke.txt. Tests and tools are checked in.

- luau-compile: PASS all seven src files.
- luau-analyze: exit 0, no diagnostics. .luaurc lists legitimate Roblox globals;
  it does not disable lint. This is standalone analysis, not Roblox API typechecking.
- Simulation tests: PASS 46 assertions. Ordered unlock, invalid inputs, dash,
  cooldown, movement, steal duration/single reward/range interruption, purchases,
  reserved fee, damage/defeat, restart state, five-vault progression, Titan phase
  and bullets, final Victory. Campaign assertion fixture uses invulnerability to
  isolate progression and damage upgrade; it is not a human balance test.
- Additional input-only orbit bot: 10/10 deterministic seeded campaigns reached
  Victory, 64–70 simulated seconds. Uses ordinary movement/dash/purchases; no HP,
  shard or invulnerability injection. This demonstrates reachability, not human
  difficulty or network responsiveness.
- Actual client source executed in mocked Roblox UI plumbing: PASS initial select,
  combat, Titan, Victory, Defeat, return select and input/render tick. This catches
  source runtime errors under the mock; it does not prove Studio appearance/API parity.
- Rojo build PASS. game.rbxl: 19,735 bytes, 19 instances, seven scripts.
- Kit parser + custom chunk traversal: 44 chunks, each decoded to declared length,
  34,387 declared uncompressed bytes, valid END and exact EOF, no parser notes.
- Source match: 100%, all seven scripts, 32,979 / 32,979 nonempty source bytes;
  no unmatched source files. Required threshold is 80%.
- Fixture dossier: 48,322 bytes, below 1.5 MiB. buildDossier deterministic twice;
  exact main.ts entry CLI exercised twice in separate outputs, byte-identical.
- SHA-256 game.rbxl:
  1e6565c436fd00e2ee7dcefde313578ead3865a84d8cad46be27cad9202ea772

## Dossier and REA limitations — do not mistake these for a final valid entry

The repository's screenshots/ contains only .gitkeep. Running buildDossier against
that directory correctly FAILED with `screenshots/ holds no image`. To exercise
packaging, tools/verify-local.py creates four uniform structural PNG fixtures at
verification/packaging-fixture/screenshots/, then calls the unchanged kit parser
and CLI. verification/dossier-draft.json is a FIXTURE DOSSIER, NOT A SUBMISSION.
These images never enter the game's screenshots/ and are not presented as captures.

Final screenshots gate: PENDING real Studio captures. Public-place gate: PENDING
actual positive place_id/universe_id and owner publication. Consequently this draft
is NOT yet a valid competition submission. The dossier must be rebuilt with real shots.

REA skill was consulted. As the brief explicitly states REA does not support rbxl,
no claim of successful native REA inspection is made. Binary evidence here is the
kit's readPlace/placeFraming/chunkData/matchSources and our exact-EOF checker.

## Honest limits / owner verification next

- No Roblox Studio available/run here. No genuine screenshot, human playtest,
  real Roblox client/server integration or visual/layout verification was performed.
- Desktop keyboard/mouse landscape is the target; no touch/gamepad controls.
- Combat uses 15 Hz server snapshots with no prediction/interpolation. Arena GUI
  objects are pooled; HUD is reconstructed per snapshot. Live latency, low-end
  performance and frame pacing still need Studio verification.
- No sound, persistence, multiplayer PvP or uploaded assets. Separate solo run per
  player, as intended for this arcade draft.
- Steal odds include failure; it is optional for victory. Early draft balance is
  deliberately accessible (bot clears quickly); human pacing remains unverified.
- Skills frontend-design and design-taste-frontend informed palette/type/hierarchy/
  interaction feedback. Website-specific browser gates are inapplicable to native
  Roblox GUI; no HTML mirror is claimed as the actual game.
- No rank/score prediction is verified. Benchmark source was the supplied Genou
  top-ten text report, not a newly retrieved live board.

Owner: open game.rbxl in Studio, perform the acceptance smoke in SHOT-LIST.md,
then capture the four screens. Publication/link filling and any eventual submission
are separate authorized steps; this report does not grant that approval.

## Local commits

1c828c9 — bootstrap inherited Rojo/kit skeleton.
cdc3b3b — five-vault simulation/server/GUI implementation.
27e428f — tests, feedback, input safety, binary tooling and shot handoff.
A final documentation/evidence commit follows this report.

No upload, submission, payment, login, remote repository creation, or Roblox
publication was performed. Local git initialization/commits only.
