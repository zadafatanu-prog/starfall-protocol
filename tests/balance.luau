local C=require("../src/shared/GameConfig")
local M=require("../src/shared/GameMath")
local S=require("../src/shared/VaultSimulation")
local E=require("../src/shared/EnemyCatalog")
local wins=0
for seed=1,10 do
 local rng={seed=seed*127}
 function rng:NextNumber(a,b) self.seed=(self.seed*16807)%2147483647; local n=self.seed/2147483647; return a and a+n*(b-a) or n end
 function rng:NextInteger(a,b) return math.floor(self:NextNumber(a,b+1)) end
 local s=S.CreateRun(C)
 for vault=1,5 do
  if s.Mode=="Defeat" then break end
  for _,id in ipairs({"Damage","Damage","Shield","Dash"}) do S.BuyUpgrade(s,id,C,M) end
  assert(S.LaunchVault(s,vault,C,E,rng))
  for frame=1,15000 do
   if s.Mode~="Playing" then break end
   local angle=frame/30*0.53
   local tx=500+math.cos(angle)*300; local ty=290+math.sin(angle)*180
   local dx,dy=M.Normalize(tx-s.X,ty-s.Y); s.Input.X=dx; s.Input.Y=dy
   local nearest=1000
   for _,e in ipairs(s.Enemies) do nearest=math.min(nearest,M.Distance(s.X,s.Y,e.X,e.Y)) end
   if nearest<65 then S.Dash(s,C,M) end
   S.Step(s,1/30,C,M,E,rng)
  end
 end
 if s.Mode=="Victory" then wins+=1 end
 print("seed",seed,s.Mode,"cleared",s.Cleared,"hull",s.Hull,"time",math.floor(s.Time))
end
print("Orbit input bot wins",wins,"of 10; no invulnerability, no HP or shard injection")
assert(wins>=5,"basic input-only bot should complete majority of deterministic seeds")
