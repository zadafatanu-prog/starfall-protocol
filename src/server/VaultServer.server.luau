-- Server authority: all run state lives in VaultSimulation; remotes only carry intents.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("GameConfig"))
local Catalog = require(Shared:WaitForChild("EnemyCatalog"))
local Math = require(Shared:WaitForChild("GameMath"))
local Simulation = require(Shared:WaitForChild("VaultSimulation"))
local remotes = Instance.new("Folder"); remotes.Name = "Remotes"; remotes.Parent = ReplicatedStorage
local function remote(name, kind) local r = Instance.new(kind or "RemoteEvent"); r.Name = name; r.Parent = remotes; return r end
local Input = remote("Input"); local Action = remote("Action"); local Snapshot = remote("Snapshot"); local Notice = remote("Notice")
local states = {}; local inputAt = {}; local actionAt = {}; local rng = Random.new()
local function safeSync(player, s)
 local clean = {Mode=s.Mode,Vault=s.Vault,Cleared=s.Cleared,Shards=s.Shards,Hull=s.Hull,MaxHull=s.MaxHull,
  X=s.X,Y=s.Y,DashLeft=s.DashLeft,DashCD=s.DashCD,Steal=s.Steal,StealCD=s.StealCD,
  Kills=s.Kills,VaultKills=s.VaultKills,Combo=s.Combo,Time=s.Time,Stolen=s.Stolen,Message=s.Message,
  Upgrades=s.Upgrades,Core=s.Core,Enemies=s.Enemies,Bullets=s.Bullets,Pickups=s.Pickups,Mines=s.Mines,Effects=s.Effects}
 Snapshot:FireClient(player, clean)
end
local function validInput(value) return Math.IsFinite(value) and math.abs(value) <= 2 end
Input.OnServerEvent:Connect(function(player, payload)
 local s = states[player]; if not s or type(payload) ~= "table" then return end
 local now=os.clock(); if now-(inputAt[player] or 0)<1/60 then return end; inputAt[player]=now
 if validInput(payload.X) and validInput(payload.Y) then s.Input.X = payload.X; s.Input.Y = payload.Y end
 if Math.IsFinite(payload.AimX) and Math.IsFinite(payload.AimY) then s.Input.AimX = math.clamp(payload.AimX,0,Config.Width); s.Input.AimY = math.clamp(payload.AimY,0,Config.Height) end
 s.Input.Fire = payload.Fire == true; s.Input.Steal = payload.Steal == true
 if payload.Dash == true then Simulation.Dash(s, Config, Math) end
end)
Action.OnServerEvent:Connect(function(player, verb, value)
 local s = states[player]; if not s or type(verb) ~= "string" then return end
 local now=os.clock(); if now-(actionAt[player] or 0)<0.12 then return end; actionAt[player]=now
 local ok = false
 if verb == "Launch" then ok = Simulation.LaunchVault(s, value, Config, Catalog, rng)
 elseif verb == "Upgrade" then ok = Simulation.BuyUpgrade(s, value, Config, Math)
 elseif verb == "Reset" then states[player] = Simulation.CreateRun(Config); s = states[player]; ok = true end
 if ok then Notice:FireClient(player, s.Message) end; safeSync(player, s)
end)
local function AddPlayer(player) if not states[player] then states[player]=Simulation.CreateRun(Config) end end
Players.PlayerAdded:Connect(AddPlayer)
for _,player in ipairs(Players:GetPlayers()) do AddPlayer(player) end
Players.PlayerRemoving:Connect(function(player) states[player] = nil; inputAt[player]=nil; actionAt[player]=nil end)
task.spawn(function()
 local accumulator = 0; local last = os.clock(); local syncAt = 0
 while true do
  task.wait(Config.Step); local now = os.clock(); local dt = math.min(0.08, now-last); last = now; accumulator += dt
  while accumulator >= Config.Step do
   accumulator -= Config.Step
   for _, s in pairs(states) do Simulation.Step(s, Config.Step, Config, Math, Catalog, rng) end
  end
  syncAt += dt; if syncAt >= Config.Sync then syncAt = 0; for player,s in pairs(states) do safeSync(player,s) end end
 end
end)
