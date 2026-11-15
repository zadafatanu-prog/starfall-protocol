-- Server-owned simulation. Dependencies injected so the exact game runs headless.
local Simulation = {}

function Simulation.CreateRun(config)
 return {Mode = "Select", Vault = 1, Cleared = 0, Unlocked = 1, Shards = 0, Hull = config.Hull,
 MaxHull = config.Hull, X = 500, Y = 400, DX = 0, DY = -1, Time = 0, Kills = 0,
 VaultKills = 0, Stolen = 0, Combo = 1, ComboTime = 0, DashLeft = 0, DashCD = 0,
 Invincible = 0, FireCD = 0, SpawnCD = 1, MineCD = 5, BossCD = 2, Steal = 0, StealCD = 0,
 Upgrades = {Damage = 0, Dash = 0, Magnet = 0, Shield = 0},
 Enemies = {}, Bullets = {}, Pickups = {}, Mines = {}, Effects = {}, NextId = 0,
 Core = {X = 500, Y = 130, Rarity = 1, Taken = false},
 Input = {X = 0, Y = 0, AimX = 500, AimY = 130, Fire = false, Steal = false},
 Auto = true, EventId = 0, Message = "Choose your ship. Clear all five sectors."}
end

local function EmitEffect(s, kind, x, y, text)
 s.EventId += 1
 table.insert(s.Effects, {Id = s.EventId, Kind = kind, X = x, Y = y, Text = text or "", TTL = 0.65})
 if #s.Effects > 45 then table.remove(s.Effects, 1) end
end

local function SpawnEnemy(s, catalog, kind, x, y)
 local def = catalog[kind]
 s.NextId += 1
 local hp = def.HP * (kind == "Titan" and 1 or (1 + (s.Vault - 1) * 0.1))
 table.insert(s.Enemies, {Id = s.NextId, Kind = kind, X = x, Y = y, HP = hp, MaxHP = hp,
 Radius = def.Radius, Age = 0, ShotCD = 2, Flash = 0, ChargeX = 0, ChargeY = 0})
end

local function SpawnMine(s, rng, x, y)
 s.NextId += 1
 table.insert(s.Mines, {Id = s.NextId, X = x or rng:NextNumber(70, 930),
 Y = y or rng:NextNumber(80, 470), HP = 24})
end

function Simulation.LaunchVault(s, index, config, catalog, rng)
 if s.Mode ~= "Select" or type(index) ~= "number" or index ~= index or index % 1 ~= 0 then return false end
 if index ~= s.Cleared + 1 or not config.Vaults[index] then
  s.Message = "Clear the sectors in order."; return false
 end
 local def = config.Vaults[index]
 if s.Shards < def.Cost then s.Message = "Need " .. def.Cost .. " score needed for this sector."; return false end
 s.Shards -= def.Cost
 s.Unlocked = index; s.Vault = index; s.Mode = "Playing"; s.VaultKills = 0
 s.X = 500; s.Y = 410; s.Enemies = {}; s.Bullets = {}; s.Pickups = {}; s.Mines = {}; s.Effects = {}
 s.Hull = s.MaxHull; s.Invincible = 1.5; s.DashCD = 0; s.DashLeft = 0; s.Steal = 0; s.StealCD = 0
 s.SpawnCD = 1.2; s.BossCD = 2; s.FireCD = 0; s.MineCD = 4
 s.Core = {X = 500, Y = 120, Rarity = index, Taken = false}
 s.Message = index == 5 and "ECLIPSE SOVEREIGN online. Dash through the bullet rings!" or "Auto-beam online. Collect score; hold E near the core."
 for _ = 1, 10 do SpawnMine(s, rng) end
 if index == 5 then SpawnEnemy(s, catalog, "Titan", 500, 160) end
 for i = 1, 6 do
  local angle = i * math.pi / 3
  SpawnEnemy(s, catalog, index == 5 and "Shard" or def.Enemy, 500 + math.cos(angle)*380, 260 + math.sin(angle)*200)
 end
 return true
end

function Simulation.BuyUpgrade(s, id, config, mathUtil)
 if s.Mode ~= "Select" then return false end
 for _, def in ipairs(config.Upgrades) do
  if def.Id == id then
   local level = s.Upgrades[id]
   local cost = mathUtil.UpgradeCost(def.Cost, level)
   local reserve = config.Vaults[s.Cleared + 1]
   if level >= def.Max then s.Message = "Upgrade already maxed."; return false end
   -- Reserve the next gate fee: the workshop can never strand a run.
   if s.Shards - cost < (reserve and reserve.Cost or 0) then
    s.Message = "Keep " .. (reserve and reserve.Cost or 0) .. " shards for the next breach."; return false
   end
   s.Shards -= cost; s.Upgrades[id] += 1
   if id == "Shield" then s.MaxHull += 20; s.Hull = s.MaxHull end
   s.Message = def.Label .. " upgraded to " .. s.Upgrades[id]
   return true
  end
 end
 return false
end

function Simulation.Dash(s, config, mathUtil)
 if s.Mode ~= "Playing" or s.DashCD > 0 then return false end
 local x, y = mathUtil.Normalize(s.Input.X, s.Input.Y)
 if x == 0 and y == 0 then x, y = s.DX, s.DY end
 s.DX = x; s.DY = y; s.DashLeft = config.DashSeconds
 s.DashCD = mathUtil.DashCooldown(s.Upgrades.Dash); s.Invincible = config.DashSeconds + 0.15
 s.Steal = 0
 EmitEffect(s, "Dash", s.X, s.Y, "DASH")
 return true
end

local function DamageHull(s, amount)
 if s.Invincible > 0 then return end
 s.Hull = math.max(0, s.Hull - amount)
 s.Invincible = 0.7; s.Steal = 0; s.Combo = 1
 EmitEffect(s, "Hurt", s.X, s.Y, "-" .. amount)
 if s.Hull <= 0 then s.Mode = "Defeat"; s.Message = "Signal lost. Your next run starts fresh." end
end

local function DropShards(s, x, y, value)
 s.NextId += 1
 table.insert(s.Pickups, {Id = s.NextId, X = x, Y = y, Value = value})
end

local function FireBullet(s, x, y, angle, speed, config)
 if #s.Bullets >= config.MaxBullets then return end
 s.NextId += 1
 table.insert(s.Bullets, {Id = s.NextId, X = x, Y = y,
 VX = math.cos(angle)*speed, VY = math.sin(angle)*speed, TTL = 6})
end

local function DefeatEnemy(s, enemy, catalog)
 s.Kills += 1; s.VaultKills += 1; s.ComboTime = 4
 s.Combo = math.min(5, s.Combo + 0.2)
 DropShards(s, enemy.X, enemy.Y, math.floor(catalog[enemy.Kind].Reward * s.Combo))
 EmitEffect(s, "Burst", enemy.X, enemy.Y, "+" .. catalog[enemy.Kind].Reward)
end

local function FireBeam(s, config, mathUtil, catalog)
 local target, distance, mine = nil, config.BeamRange, false
 for _, enemy in ipairs(s.Enemies) do
  local d = (s.Auto and not s.Input.Fire) and mathUtil.Distance(s.X, s.Y, enemy.X, enemy.Y)
   or mathUtil.Distance(s.Input.AimX, s.Input.AimY, enemy.X, enemy.Y)
  if d < distance and mathUtil.Distance(s.X, s.Y, enemy.X, enemy.Y) <= config.BeamRange then
   target = enemy; distance = d
  end
 end
 if not target then
  for _, node in ipairs(s.Mines) do
   local d = (s.Auto and not s.Input.Fire) and mathUtil.Distance(s.X, s.Y, node.X, node.Y)
    or mathUtil.Distance(s.Input.AimX, s.Input.AimY, node.X, node.Y)
   if d < distance and mathUtil.Distance(s.X, s.Y, node.X, node.Y) <= config.BeamRange then
    target = node; distance = d; mine = true
   end
  end
 end
 if not target then return end
 local damage = config.BeamDamage + s.Upgrades.Damage * 7
 target.HP -= damage; target.Flash = 0.12
 EmitEffect(s, "Beam", target.X, target.Y, tostring(damage))
 if target.Kind == "Titan" then EmitEffect(s, "TitanHit", target.X, target.Y, "") end
 if target.HP <= 0 then
  if mine then DropShards(s, target.X, target.Y, 10); EmitEffect(s, "Mine", target.X, target.Y, "+10")
  else DefeatEnemy(s, target, catalog) end
 end
end

local function ClearVault(s, config)
 s.Cleared = s.Vault
 -- Bank every dropped shard at extraction, plus the gate fee and a workshop bonus.
 for _, pickup in ipairs(s.Pickups) do s.Shards += pickup.Value end
 local nextVault = config.Vaults[s.Vault + 1]
 s.Shards += 65 + (nextVault and nextVault.Cost or 200)
 s.Pickups = {}; s.Bullets = {}; s.Steal = 0
 s.Mode = s.Vault == 5 and "Victory" or "Select"
 s.Message = s.Mode == "Victory" and "Siege broken. The Eclipse Sovereign is defeated."
  or "Sector clear! Score banked. Choose your next sector."
end

function Simulation.Step(s, dt, config, mathUtil, catalog, rng)
 if s.Mode ~= "Playing" then return end
 s.Time += dt
 for i = #s.Effects, 1, -1 do
  s.Effects[i].TTL -= dt
  if s.Effects[i].TTL <= 0 then table.remove(s.Effects, i) end
 end
 for _, key in ipairs({"DashCD", "Invincible", "StealCD", "FireCD", "SpawnCD", "MineCD", "BossCD", "ComboTime"}) do
  s[key] = math.max(0, s[key] - dt)
 end
 if s.ComboTime == 0 then s.Combo = 1 end
 local mx, my = mathUtil.Normalize(s.Input.X, s.Input.Y)
 if s.DashLeft > 0 then
  s.DashLeft = math.max(0, s.DashLeft - dt); mx = s.DX; my = s.DY
  s.X += mx * config.DashSpeed * dt; s.Y += my * config.DashSpeed * dt
 else
  if mx ~= 0 or my ~= 0 then s.DX = mx; s.DY = my end
  s.X += mx * config.PlayerSpeed * dt; s.Y += my * config.PlayerSpeed * dt
 end
 s.X = math.clamp(s.X, 20, config.Width - 20); s.Y = math.clamp(s.Y, 20, config.Height - 20)
 if (s.Auto or s.Input.Fire) and s.FireCD <= 0 then
  s.FireCD = config.BeamInterval; FireBeam(s, config, mathUtil, catalog)
 end
 for i = #s.Mines, 1, -1 do if s.Mines[i].HP <= 0 then table.remove(s.Mines, i) end end
 for i = #s.Enemies, 1, -1 do
  local e = s.Enemies[i]
  if e.HP <= 0 then
   local titan = e.Kind == "Titan"
   table.remove(s.Enemies, i)
   if titan then ClearVault(s, config); return end
  end
 end
 if s.Vault < 5 and s.VaultKills >= config.Vaults[s.Vault].Goal then ClearVault(s, config); return end
 if s.SpawnCD == 0 then
  s.SpawnCD = s.Vault == 5 and 3 or 1.1
  if #s.Enemies < config.MaxEnemies then
   local kind = s.Vault == 5 and ({"Shard", "Drifter", "Lattice", "Lancer"})[rng:NextInteger(1,4)] or config.Vaults[s.Vault].Enemy
   SpawnEnemy(s, catalog, kind, rng:NextNumber() < 0.5 and 25 or 975, rng:NextNumber(25, 525))
  end
 end
 if s.MineCD == 0 then s.MineCD = 4; if #s.Mines < 12 then SpawnMine(s, rng) end end
 for _, e in ipairs(s.Enemies) do
  e.Age += dt; e.Flash = math.max(0, e.Flash - dt); e.ShotCD -= dt
  local dx, dy = mathUtil.Normalize(s.X - e.X, s.Y - e.Y)
  local def = catalog[e.Kind]
  if e.Kind == "Titan" then
   e.Phase = mathUtil.TitanPhase(e.HP, e.MaxHP)
   e.X = 500 + math.sin(e.Age * 0.5) * 230; e.Y = 150 + math.sin(e.Age)*45
   if e.ShotCD <= 0 then
    e.ShotCD = 1.6 - e.Phase * 0.25
    for n = 1, 8 + e.Phase * 2 do
     FireBullet(s, e.X, e.Y, n * math.pi * 2 / (8 + e.Phase * 2) + e.Age * 0.25, 95 + 18 * e.Phase, config)
    end
    if e.Phase >= 2 and #s.Enemies < config.MaxEnemies then SpawnEnemy(s, catalog, "Shard", e.X + 50, e.Y + 55) end
    EmitEffect(s, "Titan", e.X, e.Y, "PHASE " .. e.Phase)
   end
  elseif e.Kind == "Lancer" then
   local cycle = e.Age % 2.8
   if cycle < 0.7 then e.ChargeX = dx; e.ChargeY = dy
   elseif cycle < 1.3 then e.X += e.ChargeX * 290 * dt; e.Y += e.ChargeY * 290 * dt
   else e.X += dx * def.Speed * dt; e.Y += dy * def.Speed * dt end
  else
   local speed = def.Speed
   if e.Kind == "Drifter" then
    local wave = math.sin(e.Age * 4) * 0.9
    local oldX = dx; dx -= dy * wave; dy += oldX * wave
   elseif e.Kind == "Lattice" and e.ShotCD <= 0 then
    e.ShotCD = 2.5; FireBullet(s, e.X, e.Y, math.atan2(dy, dx), 140, config)
   end
   e.X += dx * speed * dt; e.Y += dy * speed * dt
  end
  e.X = math.clamp(e.X, 10, 990); e.Y = math.clamp(e.Y, 10, 540)
  if mathUtil.Distance(s.X, s.Y, e.X, e.Y) < e.Radius + config.PlayerRadius then DamageHull(s, e.Kind == "Titan" and 24 or 12) end
 end
 for i = #s.Bullets, 1, -1 do
  local b = s.Bullets[i]; b.X += b.VX * dt; b.Y += b.VY * dt; b.TTL -= dt
  local hit = mathUtil.Distance(s.X, s.Y, b.X, b.Y) < 17
  if hit then DamageHull(s, 10) end
  if hit or b.TTL <= 0 or b.X < 0 or b.X > 1000 or b.Y < 0 or b.Y > 550 then table.remove(s.Bullets, i) end
 end
 if s.Mode ~= "Playing" then return end
 for i = #s.Pickups, 1, -1 do
  local p = s.Pickups[i]; local d = mathUtil.Distance(s.X, s.Y, p.X, p.Y)
  if d < config.PickupRange + s.Upgrades.Magnet * 24 then
   s.Shards += p.Value; EmitEffect(s, "Pickup", p.X, p.Y, "+" .. p.Value); table.remove(s.Pickups, i)
  end
 end
 local core = s.Core
 if s.Input.Steal and not core.Taken and s.StealCD == 0 and s.DashLeft == 0
  and mathUtil.Distance(s.X, s.Y, core.X, core.Y) <= config.StealRange then
  s.Steal += dt
  if s.Steal >= config.StealSeconds then
   s.Steal = 0; s.StealCD = config.StealCooldown
   if mathUtil.StealSucceeds(rng, 0.95, core.Rarity) then
    core.Taken = true; s.Stolen += 1; s.Shards += 35 * core.Rarity
    s.Hull = math.min(s.MaxHull, s.Hull + 20)
    s.Message = "CORE STOLEN! +" .. 35 * core.Rarity .. " shards / +20 repair"
    EmitEffect(s, "Steal", core.X, core.Y, "CORE STOLEN")
   else s.Message = "Core resisted. Retry after cooldown."; EmitEffect(s, "Resist", core.X, core.Y, "RESISTED") end
  end
 else s.Steal = 0 end
end
return Simulation
