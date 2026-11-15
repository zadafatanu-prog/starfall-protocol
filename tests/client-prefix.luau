-- Runtime smoke harness prefix: mocks only Roblox UI plumbing, never game state.
local callbacks={}
local objects={}
local function signal(name)
 return {Connect=function(_,fn) callbacks[name]=callbacks[name] or {}; table.insert(callbacks[name],fn); return {Disconnect=function() end} end}
end
local methods={}
function methods:GetChildren() return self.children end
function methods:IsA(k) return self.ClassName==k end
function methods:Destroy() self.destroyed=true; if self.Parent then for i,c in ipairs(self.Parent.children) do if c==self then table.remove(self.Parent.children,i); break end end end end
function methods:WaitForChild(n) return self[n] or self.childrenByName[n] end
function methods:GetPropertyChangedSignal(n) return signal(n) end
local function new(class)
 local o={ClassName=class,children={},childrenByName={},AbsoluteSize={X=1000,Y=550},AbsolutePosition={X=0,Y=0}}
 o.Activated=signal("Activated"); o.InputBegan=signal("UIInput")
 setmetatable(o,{__index=methods,__newindex=function(t,k,v) rawset(t,k,v); if k=="Parent" then table.insert(v.children,t); v.childrenByName[t.Name or class]=t end end})
 table.insert(objects,o); return o
end
local Instance={new=new}
local Color3={fromRGB=function(r,g,b) return {r,g,b} end}
local UDim2={fromOffset=function(x,y) return {X=x,Y=y} end,fromScale=function(x,y) return {X=x,Y=y} end}
local Vector2={new=function(x,y) return {X=x,Y=y} end}
local TweenInfo={new=function(v) return v end}
local ColorSequence={new=function(v) return v end}
local ColorSequenceKeypoint={new=function(a,b) return {a,b} end}
local Enum={Font={GothamBold=1,GothamBlack=2},TextXAlignment={Left=1,Center=2},ZIndexBehavior={Sibling=1},UserInputType={MouseMovement=1,MouseButton1=2},KeyCode={D=1,A=2,S=3,W=4,E=5,LeftShift=6}}
local workspace={CurrentCamera={ViewportSize=Vector2.new(1280,720)}}
local function remote(n) return {OnClientEvent=signal(n),FireServer=function() end} end
local remotes={Input=remote("Input"),Action=remote("Action"),Snapshot=remote("Snapshot"),Notice=remote("Notice")}
local Shared={GameConfig="Config",WaitForChild=function(self,n) return self[n] end}
function remotes:WaitForChild(n) return self[n] end
local RS={WaitForChild=function(_,name) return name=="Shared" and Shared or remotes end}
local pg=new("PlayerGui")
local services={TweenService={Create=function() return {Completed=signal("TweenCompleted"),Play=function() end} end},Players={LocalPlayer={WaitForChild=function() return pg end}},ReplicatedStorage=RS,
 UserInputService={WindowFocusReleased=signal("WindowFocusReleased"),InputBegan=signal("InputBegan"),InputEnded=signal("InputEnded"),InputChanged=signal("InputChanged")},RunService={RenderStepped=signal("RenderStepped")}}
local game={GetService=function(_,name) return services[name] end}
local script={Parent={UIFactory="UI",WaitForChild=function(self,n) return self[n] end}}
