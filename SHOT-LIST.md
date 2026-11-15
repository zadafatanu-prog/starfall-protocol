# NEON VAULT: SPECTRUM HEIST — Studio shot list

Draft only. No screenshots have been captured in Roblox Studio on this Linux host.
Do NOT use verification/packaging-fixture images: they are blank parser-test fixtures,
not game evidence. Put only actual running-game PNG/JPEG captures in screenshots/.

Use a landscape game viewport, ideally 1280×720 (or 1000×550). Each image must
have long side ≤1280 px, short side ≥480 px, and size ≤200 KiB (hard gate 256 KiB).
JPEG quality 80–90 usually works. Keep all four together under 800 KiB.

1. `1-vault-select.jpg` — COVER. Open game.rbxl in Studio, press Play, wait for
   initial state. Show NEON VAULT gradient title, prism beam, five cards with
   threats/locks, Crimson LAUNCH, workshop, control hints. Don't crop the game.
2. `2-combat.jpg` — Launch Crimson or Azure. WASD around the arena; auto-beam
   runs continuously. Hold Mouse1 to prioritise targets near cursor; SHIFT dashes.
   Capture with several enemies, yellow mine nodes/pickups, visible cyan beam,
   damage numbers, hull/shards/clock/progress/dash/multiplier HUD.
3. `3-core-heist.jpg` — Move near the rival core (ring around x=500,y=120),
   hold E for two seconds. Capture the channel bar mid-fill. Alternative: Violet
   Titan phase two/three, radial bullets and minions, with boss HP visible.
4. `4-victory.jpg` — Clear four vaults and defeat Titan. Each normal clear banks
   pickups, pays a gate reserve and workshop bonus. Buy BEAM in the workshop,
   then launch the next vault. Capture VAULTS BREACHED with stats / PLAY AGAIN.

Studio acceptance smoke:
- Initial menu shows without Output errors. Launch button works once, every time.
- Movement and dash respond; enemies damage hull; auto beam kills and mines.
- Steal progresses only in range while E is held; leaving range cancels.
- Workshop takes shards, preserves next-gate reserve, and changes upgrade level.
- Five clears end in Victory; PLAY AGAIN resets to first menu.
- Stand still until hull is zero; RETRY resets to first menu.
- Check scale at 1280×720 and 1000×550. Desktop keyboard/mouse is the target.

Publication is OUTSIDE this draft. Owner may later publish a Public experience and
provide actual place_id/universe_id; PLAY.json intentionally still contains zeros.
No instruction in this file authorizes submission. Specific approval is still required.
