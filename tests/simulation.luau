local C=require("../src/shared/GameConfig")
local M=require("../src/shared/GameMath")
local S=require("../src/shared/VaultSimulation")
local E=require("../src/shared/EnemyCatalog")
local count=0
local function check(value,label) assert(value,label); count+=1 end
local rng={seed=734}
function rng:NextNumber(a,b)
 self.seed=(self.seed*16807)%2147483647
 local n=self.seed/2147483647
 if a then return a+n*(b-a) end
 return n
end
function rng:NextInteger(a,b) return math.floor(self:NextNumber(a,b+1)) end
check(not M.IsFinite(0/0),"NaN refused"); check(not M.IsFinite(math.huge),"Infinity refused")
check(not M.IsFinite("1"),"string refused")
check(M.FormatTime(125)=="02:05","clock")
local x,y=M.Normalize(3,4); check(x==0.6 and y==0.8,"normalize")
check(M.TitanPhase(900,1000)==1 and M.TitanPhase(500,1000)==2 and M.TitanPhase(100,1000)==3,"three boss phases")
check(M.DashCooldown(3)<M.DashCooldown(0),"dash upgrade")
local s=S.CreateRun(C)
check(not S.LaunchVault(s,2,C,E,rng),"cannot skip vault")
check(not S.LaunchVault(s,1.5,C,E,rng),"fractional vault rejected")
check(S.LaunchVault(s,1,C,E,rng),"start")
check(#s.Enemies==6 and #s.Mines==10,"dense arena")
check(not S.LaunchVault(s,1,C,E,rng),"cannot relaunch in combat")
s.Input.X=1; check(S.Dash(s,C,M),"dash accepted"); check(not S.Dash(s,C,M),"dash cooldown enforced")
S.Step(s,1/30,C,M,E,rng); check(s.X>500,"server movement")
check(not S.BuyUpgrade(s,"Damage",C,M),"no workshop midfight")
local steal=S.CreateRun(C); S.LaunchVault(steal,1,C,E,rng)
steal.Enemies={}; steal.SpawnCD=999; steal.Auto=false; steal.X=steal.Core.X; steal.Y=steal.Core.Y; steal.Input.Steal=true
local success={NextNumber=function() return 0 end}
for _=1,65 do S.Step(steal,1/30,C,M,E,success) end
check(steal.Stolen==1 and steal.Core.Taken,"channel completes with successful roll")
local shards=steal.Shards
for _=1,120 do S.Step(steal,1/30,C,M,E,success) end
check(steal.Shards==shards,"core cannot be stolen twice")
local interrupted=S.CreateRun(C); S.LaunchVault(interrupted,1,C,E,rng)
interrupted.Enemies={}; interrupted.SpawnCD=999; interrupted.Auto=false; interrupted.X=500; interrupted.Y=120; interrupted.Input.Steal=true
for _=1,15 do S.Step(interrupted,1/30,C,M,E,rng) end
check(interrupted.Steal>0,"channel begins")
interrupted.X=900; S.Step(interrupted,1/30,C,M,E,rng); check(interrupted.Steal==0,"range breaks channel")
local loss=S.CreateRun(C); S.LaunchVault(loss,1,C,E,rng); loss.Auto=false; loss.Hull=1; loss.Invincible=0
loss.Enemies[1].X=loss.X; loss.Enemies[1].Y=loss.Y
S.Step(loss,1/30,C,M,E,rng); check(loss.Mode=="Defeat" and loss.Hull==0,"defeat at zero hull")
check(S.CreateRun(C).Mode=="Select","restart creates clean select")
-- Real beam damage, enemy death and sequential clear, with invulnerability only in this fixture.
local campaign=S.CreateRun(C)
for vault=1,5 do
 check(S.LaunchVault(campaign,vault,C,E,rng),"launch vault "..vault)
 if vault==5 then
  local boss=campaign.Enemies[1]; boss.HP=boss.MaxHP*0.3
  campaign.Auto=false; campaign.Invincible=999
  for _=1,100 do S.Step(campaign,1/30,C,M,E,rng) end
  check(boss.Phase==3 and #campaign.Bullets>0,"Titan phase three emits ring bullets")
  campaign.Auto=true
 end
 campaign.Upgrades.Damage=4; campaign.Invincible=9999
 for _=1,18000 do
  if campaign.Mode~="Playing" then break end
  -- Aim autopilot: follow nearest hostile; no enemy HP mutation.
  local target=campaign.Enemies[1]
  if target then
   local dx,dy=M.Normalize(target.X-campaign.X,target.Y-campaign.Y)
   campaign.Input.X=dx; campaign.Input.Y=dy
  end
  S.Step(campaign,1/30,C,M,E,rng)
 end
 check(campaign.Cleared==vault,"combat clears vault "..vault)
 if vault<5 then
  check(campaign.Shards>=C.Vaults[vault+1].Cost,"next gate affordable")
  local before=campaign.Shards; campaign.Shards=C.Vaults[vault+1].Cost
  check(not S.BuyUpgrade(campaign,"Shield",C,M),"gate reserve protected")
  campaign.Shards=before
  check(S.BuyUpgrade(campaign,"Shield",C,M),"workshop purchase")
 end
end
check(campaign.Mode=="Victory","campaign victory")
print("PASS "..count.." assertions; full five-vault headless campaign, defeat, restart, steal, upgrades, Titan patterns")
