from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
config=(root/'src/shared/GameConfig.luau').read_text()
ui=(root/'src/client/UIFactory.luau').read_text()
client=(root/'src/client/VaultClient.client.luau').read_text()
prefix=(root/'tests/client-prefix.luau').read_text()
body=prefix+'\nlocal ConfigModule=(function()\n'+config+'\nend)()\nlocal UIModule=(function()\n'+ui+'\nend)()\nlocal function require(n) if n=="Config" then return ConfigModule end return UIModule end\n'+client
body+='''
local function emit(s) for _,fn in ipairs(callbacks.Snapshot) do fn(s) end end
local sample={Mode="Playing",Vault=1,Cleared=0,Shards=30,Hull=80,MaxHull=100,DashCD=1,DashLeft=0,Steal=1,StealCD=0,Kills=3,VaultKills=3,Combo=1.6,Time=35,Stolen=0,Message="Combat smoke",Upgrades={Damage=0,Dash=0,Magnet=0,Shield=0},X=500,Y=400,Core={X=500,Y=120,Taken=false},Mines={{X=120,Y=200}},Pickups={{X=300,Y=300}},Bullets={{X=450,Y=400}},Effects={{Id=1,Kind="Beam",TTL=0.6,X=600,Y=300,Text="16"}},Enemies={{Kind="Shard",X=600,Y=300,HP=10,MaxHP=26,Flash=0}}}
emit(sample)
sample.Vault=5; sample.Enemies={{Kind="Titan",X=500,Y=180,HP=300,MaxHP=1250,Flash=0.1}}; emit(sample)
sample.Mode="Victory"; sample.Cleared=5; emit(sample)
sample.Mode="Defeat"; emit(sample)
sample.Mode="Select"; sample.Cleared=1; sample.Vault=1; emit(sample)
for _,fn in ipairs(callbacks.RenderStepped) do fn(1/30) end
print("PASS client source smoke: initial select, combat, Titan, victory, defeat, return select, render/input tick")
'''
out=root/'verification/client-smoke.generated.luau'; out.write_text(body)
r=subprocess.run(['/home/hatch/workspace/bug-hunting/tools/bin/luau',str(out)],capture_output=True,text=True)
(root/'verification/client-smoke.txt').write_text(r.stdout+r.stderr)
print(r.stdout+r.stderr); raise SystemExit(r.returncode)
