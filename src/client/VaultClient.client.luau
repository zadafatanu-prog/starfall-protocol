-- Client renderer: input and pixels only. The server snapshot is the source of truth.
local Players=game:GetService("Players"); local UIS=game:GetService("UserInputService"); local RunService=game:GetService("RunService")
local RS=game:GetService("ReplicatedStorage"); local Shared=RS:WaitForChild("Shared"); local Config=require(Shared:WaitForChild("GameConfig")); local UI=require(script.Parent:WaitForChild("UIFactory"))
local Remotes=RS:WaitForChild("Remotes"); local Input=Remotes:WaitForChild("Input"); local Action=Remotes:WaitForChild("Action"); local Snapshot=Remotes:WaitForChild("Snapshot"); local Notice=Remotes:WaitForChild("Notice")
local player=Players.LocalPlayer; local gui=Instance.new("ScreenGui"); gui.Name="StarfallProtocolHUD"; gui.IgnoreGuiInset=true; gui.ResetOnSpawn=false; gui.Parent=player:WaitForChild("PlayerGui")
local canvas=Instance.new("Frame"); canvas.Name="Canvas"; canvas.Size=UDim2.fromScale(1,1); canvas.BackgroundColor3=UI.Navy; canvas.BorderSizePixel=0; canvas.Parent=gui
local world=Instance.new("Frame"); world.Name="World"; world.Size=UDim2.fromScale(1,1); world.BackgroundTransparency=1; world.ClipsDescendants=true; world.Visible=false; world.Parent=canvas
local hud=Instance.new("Frame"); hud.Name="HUD"; hud.Size=UDim2.fromScale(1,1); hud.BackgroundTransparency=1; hud.Parent=canvas
gui.ZIndexBehavior=Enum.ZIndexBehavior.Sibling; world.ZIndex=1; hud.ZIndex=2
local scale=Instance.new("UIScale"); scale.Scale=1; scale.Parent=canvas
local state: any={Mode="Select",Vault=1,Cleared=0,Upgrades={Damage=0,Dash=0,Magnet=0,Shield=0},Shards=0,Hull=100,MaxHull=100,Enemies={},Bullets={},Pickups={},Mines={},Effects={},Core={}}
local key={}; local aimX,aimY=500,200; local firing=false; local stealing=false; local dash=false
local function clear(parent) if parent==world then UI.BeginPooledFrame(parent); return end; for _,c in ipairs(parent:GetChildren()) do if not c:IsA("UIScale") then c:Destroy() end end end
local function mapX(v) return v end
local function mapY(v) return v end
local function fit()
 local viewport=workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1000,550)
 scale.Scale=math.min(viewport.X/1000,viewport.Y/550)
 canvas.Position=UDim2.fromOffset((viewport.X-1000*scale.Scale)/2,(viewport.Y-550*scale.Scale)/2)
 canvas.Size=UDim2.fromOffset(1000,550)
end
fit()
local function title(text,x,y,w,size,color) local t=UI.Label(hud,text,x,y,w,60,size,color); t.Font=Enum.Font.GothamBlack; return t end
local function drawGrid()
 for x=0,1000,50 do UI.Line(world,x,0,x,550,Color3.fromRGB(19,35,61),1) end
 for y=0,550,50 do UI.Line(world,0,y,1000,y,Color3.fromRGB(19,35,61),1) end
 for i=1,35 do local x=((i*137)%960)+20; local y=((i*79)%480)+25; UI.Glyph(world,"·",x,y,12,Color3.fromRGB(45,92,130)) end
end
local shipChoice=1
local helpOpen=false
local bestScore=0
local function buildSelect()
 clear(world); clear(hud); world.Visible=true; drawGrid()
 -- Striped retro sun, deliberately built from GUI primitives for Rojo safety.
 local sun=UI.PanelAt(hud,"RetroSun",408,42,184,184,Color3.fromRGB(255,126,49))
 for i=1,11 do local stripe=UI.PanelAt(sun,"SunStripe",0,(i-1)*17,184,9,Color3.fromRGB(255,math.max(48,166-i*10),45+i*3)); stripe.ZIndex=2 end
 title("STARFALL PROTOCOL",270,36,460,38,Color3.fromRGB(255,150,104)); UI.Label(hud,"Break the siege. Kill the Sovereign.",330,78,380,24,15,UI.Cyan)
 UI.Label(hud,"SELECT YOUR SHIP",42,132,270,24,16,UI.White)
 local ships={{"VANGUARD",100,1.0,1.0},{"SPECTER",70,1.2,1.3},{"BULWARK",150,0.9,0.8}}
 for i,ship in ipairs(ships) do
  local x=42+(i-1)*190; local color=({UI.Cyan,Color3.fromRGB(255,92,174),Color3.fromRGB(255,164,72)})[i]
  local card=UI.PanelAt(hud,"Ship"..i,x,164,176,164,Color3.fromRGB(10,19,37),i==shipChoice and color or Color3.fromRGB(49,65,85))
  UI.Glyph(card,"▲",88,35,38,color); UI.Label(card,ship[1],12,65,152,22,15,UI.White)
  for n,row in ipairs({{"HULL",ship[2]/150},{"BEAM",ship[3]/1.2},{"SPEED",ship[4]/1.3}}) do UI.Label(card,row[1],12,91+(n-1)*20,46,16,10,UI.Muted); UI.PanelAt(card,"Track",61,96+(n-1)*20,98,7,Color3.fromRGB(38,49,68)); UI.PanelAt(card,"Stat",61,96+(n-1)*20,98*row[2],7,color) end
  UI.Button(card,i==shipChoice and "SELECTED" or "SELECT SHIP",10,143,156,27,color,function() shipChoice=i; buildSelect() end)
 end
 UI.Label(hud,"CHOOSE YOUR RUN",630,132,290,24,16,UI.White)
 UI.Button(hud,"LAUNCH CAMPAIGN",630,166,320,48,Color3.fromRGB(255,116,72),function() Action:FireServer("Launch",state.Cleared+1) end)
 UI.Button(hud,"BOSS RUSH  [LOCKED]",630,222,320,38,Color3.fromRGB(65,76,102),function() state.Message="Boss Rush unavailable in this build."; buildSelect() end)
 UI.Button(hud,helpOpen and "HIDE CONTROLS" or "HOW TO PLAY",630,268,320,34,UI.Cyan,function() helpOpen=not helpOpen; buildSelect() end)
 if helpOpen then UI.Label(hud,"WASD move  |  Mouse1 aim + fire  |  Shift dash\nHold E near the core to steal it. Clear five sectors, defeat the Sovereign.",630,307,330,43,12,UI.White) end
 UI.Label(hud,"BEST SCORE",630,362,160,20,12,UI.Muted); UI.Label(hud,tostring(bestScore),630,384,160,30,22,Color3.fromRGB(255,205,100)); UI.Label(hud,"BEST RUNS  "..(bestScore>0 and "1 local run" or "No runs yet"),800,384,160,24,12,UI.Muted)
 UI.Glyph(hud,"▲",500,96,60,UI.White); UI.Label(hud,"THE ECLIPSE SOVEREIGN",404,110,230,20,11,Color3.fromRGB(255,132,94))
 UI.Label(hud,"SECTORS: EMBER GATE / AMBER DRIFT / VERDANT BELT / AZURE DEEP / VIOLET THRONE",42,430,900,22,12,UI.Cyan)
 UI.Label(hud,"WASD MOVE     MOUSE1 AIM + FIRE     SHIFT DASH     HOLD E SECURE CORE",42,510,900,22,13,UI.Muted)
end
local function drawBar(parent,x,y,w,value,max,color,label)
 UI.Label(parent,label,x,y-24,w,20,12,UI.Muted); UI.PanelAt(parent,"Bar",x,y,w,12,Color3.fromRGB(32,42,62)); UI.PanelAt(parent,"Fill",x,y,math.max(2,w*math.clamp(value/max,0,1)),12,color)
end
local function buildEnd(victory)
 clear(world); clear(hud); world.Visible=false
 local score=state.Shards or 0
 local grade=score>=200000 and "S" or score>=120000 and "A" or score>=60000 and "B" or "C"
 title(victory and "SIEGE BROKEN!" or "SHIP LOST",250,64,500,38,victory and Color3.fromRGB(255,200,90) or Color3.fromRGB(255,90,120))
 UI.Label(hud,"GRADE  "..grade.."     SCORE  "..score,260,125,500,32,23,UI.White)
 UI.Label(hud,"KILLS  "..(state.Kills or 0).."     ACCURACY  N/A     TIME  "..math.floor(state.Time or 0).."s",210,183,580,26,16,UI.Muted)
 UI.Label(hud,"SECTORS CLEARED  "..(state.Cleared or 0).." / 5",210,223,580,24,15,UI.Cyan)
 UI.Label(hud,"MEDALS  "..((state.Cleared==5 and "SECTOR SWEEPER  ") or "")..((state.Hull==state.MaxHull and "FLAWLESS  ") or "")..((score>=120000 and "SHARPSHOOTER  ") or "")..(victory and "SOVEREIGN SLAYER" or ""),130,285,740,34,14,Color3.fromRGB(255,205,100))
 UI.Label(hud,"BEST  "..math.max(score,state.BestScore or 0),390,338,240,24,15,UI.White)
 UI.Button(hud,"LAUNCH AGAIN",250,400,220,52,UI.Cyan,function() Action:FireServer("Reset") end)
 UI.Button(hud,"RETURN TO MENU",520,400,220,52,UI.Panel,function() Action:FireServer("Reset") end)
end
local function renderWorld()
 clear(world); clear(hud); world.Visible=true; drawGrid(); local v=Config.Vaults[state.Vault]; local col=UI.Color(v.Color)
 UI.PanelAt(hud,"Top",22,18,956,66,Color3.fromRGB(9,17,34),col); UI.Label(hud,"SECTOR "..({"I","II","III","IV","V"})[state.Vault].."  //  "..v.Name,170,29,330,24,18,UI.White); UI.Label(hud,state.Mode=="Playing" and (state.Vault==5 and "ECLIPSE SOVEREIGN  //  PHASE "..(state.Enemies[1] and state.Enemies[1].Phase or 1).." / III" or v.Enemy.." HUNT") or state.Mode,40,54,300,18,12,col); UI.Label(hud,"SCORE  "..state.Shards,700,29,120,22,16,Color3.fromRGB(255,205,100)); UI.Label(hud,"x"..string.format("%.1f",state.Combo),860,29,90,22,18,UI.Cyan)
 drawBar(hud,40,100,190,state.Hull,state.MaxHull,Color3.fromRGB(255,74,112),"HULL  "..math.floor(state.Hull).." / "..state.MaxHull); drawBar(hud,250,100,160,state.DashCD<=0 and 1 or (1-state.DashCD/math.max(1,2.6-state.Upgrades.Dash*0.45)),1,UI.Cyan,"DASH"); drawBar(hud,430,100,180,state.Vault==5 and (state.Enemies[1] and state.Enemies[1].HP or 0) or state.VaultKills, state.Vault==5 and (state.Enemies[1] and state.Enemies[1].MaxHP or 1) or Config.Vaults[state.Vault].Goal, col,state.Vault==5 and "ECLIPSE SOVEREIGN" or "SECTOR PROGRESS")
 for _,p in ipairs(state.Pickups) do UI.Glyph(world,"✧",mapX(p.X),mapY(p.Y),24,Color3.fromRGB(255,220,90)) end
 for _,m in ipairs(state.Mines) do UI.Glyph(world,"◇",mapX(m.X),mapY(m.Y),26,Color3.fromRGB(255,220,90)) end
 for _,b in ipairs(state.Bullets) do UI.Glyph(world,"•",mapX(b.X),mapY(b.Y),18,Color3.fromRGB(255,100,170)) end
 for _,e in ipairs(state.Enemies) do local ec=UI.Color(({Shard={255,81,112},Drifter={255,182,67},Lattice={62,235,166},Lancer={66,178,255},Titan={184,120,255}})[e.Kind]); UI.Glyph(world, e.Kind=="Titan" and "✦" or ({Shard="◆",Drifter="●",Lattice="▦",Lancer="▲"})[e.Kind],mapX(e.X),mapY(e.Y),e.Kind=="Titan" and 76 or 42,e.Flash>0 and UI.White or ec); drawBar(world,mapX(e.X)-(e.Kind=="Titan" and 50 or 25),mapY(e.Y)-(e.Kind=="Titan" and 58 or 28),e.Kind=="Titan" and 100 or 50,e.HP,e.MaxHP,ec,e.Kind=="Titan" and "TITAN" or "") end
 local c=state.Core; if not c.Taken then UI.Glyph(world,"◎",mapX(c.X),mapY(c.Y),48,col); if state.Steal>0 then drawBar(hud,390,475,220,state.Steal,Config.StealSeconds,Color3.fromRGB(255,205,100),"CHANNELING · HOLD E") end end
 UI.PanelAt(hud,"Objective",22,178,956,34,Color3.fromRGB(9,17,34)); UI.PanelAt(hud,"ObjectiveAccent",22,178,4,34,col)
 UI.Label(hud,state.Vault==5 and "DEFEAT THE SOVEREIGN  ·  STEAL THE CORE  ·  SURVIVE" or "CLEAR THE SECTOR  ·  SECURE THE CORE  ·  REACH THE GATE",38,184,680,22,14,UI.White)
 UI.Label(hud,string.format("SECTOR %d/5     SHARDS %d",state.Vault, state.Shards),744,184,220,22,14,Color3.fromRGB(255,205,100))
 if not c.Taken then UI.Label(hud,"HOLD E TO SECURE CORE",390,500,240,22,14,UI.White) end
 UI.Glyph(world,"▲",mapX(state.X),mapY(state.Y),34,UI.Cyan)
 for _,fx in ipairs(state.Effects) do
  if fx.Kind=="Beam" and fx.TTL>0.48 then UI.Line(world,state.X,state.Y,fx.X,fx.Y,UI.Cyan,3) end
  if fx.Kind=="Dash" then UI.Line(world,fx.X,fx.Y,state.X,state.Y,UI.Cyan,7) end
  UI.Label(world,fx.Text,fx.X-35,fx.Y-40-(0.65-fx.TTL)*35,100,24,15,fx.Kind=="Hurt" and Color3.fromRGB(255,100,130) or UI.White)
 end
 if state.DashLeft>0 then UI.Glyph(world,"◇",state.X,state.Y,50,UI.White) end
 UI.Label(hud,string.format("%02d:%02d",math.floor(state.Time/60),math.floor(state.Time)%60),625,29,75,22,16,UI.Muted)
 UI.Label(hud,state.Message,40,520,860,22,13,UI.Muted)
end
local function TransitionScreen()
 local veil=UI.PanelAt(canvas,"Transition",0,0,1000,550,UI.Navy)
 veil.ZIndex=10
 local tween=game:GetService("TweenService"):Create(veil,TweenInfo.new(0.3),{BackgroundTransparency=1})
 tween.Completed:Connect(function() veil:Destroy() end)
 tween:Play()
end
local lastScreen=""; local previousMode="Select"
local lastEvent=0; local shake=0
Snapshot.OnClientEvent:Connect(function(s)
 if s.Mode=="Select" and s.Cleared==0 and s.Time==0 then lastEvent=0 end
 state=s
 for _,fx in ipairs(s.Effects) do if fx.Id>lastEvent then
  if fx.Kind=="Hurt" or fx.Kind=="Titan" or fx.Kind=="TitanHit" then shake=0.2 end
  lastEvent=fx.Id
 end end
 local signature=s.Mode..":"..s.Cleared..":"..s.Shards..":"..s.Message
 if s.Mode=="Playing" then renderWorld()
 elseif signature~=lastScreen then
  if s.Mode=="Select" then buildSelect() elseif s.Mode=="Victory" then buildEnd(true) elseif s.Mode=="Defeat" then buildEnd(false) end
 end
 if s.Mode~=previousMode then TransitionScreen(); previousMode=s.Mode end
 lastScreen=signature
end)
Notice.OnClientEvent:Connect(function(text) state.Message=text end)
UIS.InputBegan:Connect(function(io,gp) if gp then return end; key[io.KeyCode]=true; if io.KeyCode==Enum.KeyCode.LeftShift then dash=true end; if io.KeyCode==Enum.KeyCode.E then stealing=true end end)
UIS.InputEnded:Connect(function(io) key[io.KeyCode]=false; if io.KeyCode==Enum.KeyCode.LeftShift then dash=false end; if io.KeyCode==Enum.KeyCode.E then stealing=false end end)
UIS.InputChanged:Connect(function(io) if io.UserInputType==Enum.UserInputType.MouseMovement then aimX=(io.Position.X-canvas.AbsolutePosition.X)/scale.Scale; aimY=(io.Position.Y-canvas.AbsolutePosition.Y)/scale.Scale end end)
UIS.InputBegan:Connect(function(io,gp) if not gp and io.UserInputType==Enum.UserInputType.MouseButton1 then firing=true end end); UIS.InputEnded:Connect(function(io) if io.UserInputType==Enum.UserInputType.MouseButton1 then firing=false end end)
UIS.WindowFocusReleased:Connect(function() key={}; stealing=false; firing=false; dash=false end)
local sendElapsed=0
RunService.RenderStepped:Connect(function(dt) fit(); shake=math.max(0,shake-dt); if shake>0 then world.Position=UDim2.fromOffset(math.sin(os.clock()*90)*4,math.cos(os.clock()*75)*3) else world.Position=UDim2.fromOffset(0,0) end; sendElapsed+=dt; if sendElapsed<1/30 then return end; sendElapsed=0; local x=(key[Enum.KeyCode.D] and 1 or 0)-(key[Enum.KeyCode.A] and 1 or 0); local y=(key[Enum.KeyCode.S] and 1 or 0)-(key[Enum.KeyCode.W] and 1 or 0); Input:FireServer({X=x,Y=y,AimX=aimX,AimY=aimY,Fire=firing,Steal=stealing,Dash=dash}); dash=false end)
buildSelect()
