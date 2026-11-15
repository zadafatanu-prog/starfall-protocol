-- Shared panel, label, and button primitives for STARFALL PROTOCOL.
local UI = {}
local pools=setmetatable({}, {__mode="k"})
function UI.BeginPooledFrame(parent)
 local pool=pools[parent]
 if not pool then pool={Frames={},Labels={},FrameIndex=0,LabelIndex=0}; pools[parent]=pool end
 pool.FrameIndex=0; pool.LabelIndex=0
 for _,item in ipairs(pool.Frames) do item.Visible=false end
 for _,item in ipairs(pool.Labels) do item.Visible=false end
end
local function Acquire(parent, class)
 local pool=pools[parent]
 if not pool then return Instance.new(class) end
 local list=class=="Frame" and pool.Frames or pool.Labels
 local key=class=="Frame" and "FrameIndex" or "LabelIndex"
 pool[key]+=1
 local item=list[pool[key]]
 if not item then item=Instance.new(class); list[pool[key]]=item end
 item.Visible=true
 return item
end
UI.Navy = Color3.fromRGB(7, 12, 27)
UI.Panel = Color3.fromRGB(15, 24, 45)
UI.White = Color3.fromRGB(235, 245, 255)
UI.Muted = Color3.fromRGB(143, 167, 195)
UI.Cyan = Color3.fromRGB(100, 240, 255)
function UI.Color(rgb) return Color3.fromRGB(rgb[1],rgb[2],rgb[3]) end
function UI.PanelAt(parent, name, x,y,w,h, color, edge)
 local f = Acquire(parent,"Frame"); f.Rotation=0; f.AnchorPoint=Vector2.new(0,0); f.Name=name; f.Position=UDim2.fromOffset(x,y); f.Size=UDim2.fromOffset(w,h)
 f.BackgroundColor3=color or UI.Panel; f.BorderSizePixel=0; f.Parent=parent
 if edge then local s=Instance.new("UIStroke"); s.Color=edge; s.Thickness=1.5; s.Parent=f end
 return f
end
function UI.Label(parent, text, x,y,w,h,size,color)
 local t=Acquire(parent,"TextLabel"); t.Name="Text"; t.Position=UDim2.fromOffset(x,y); t.Size=UDim2.fromOffset(w,h)
 t.BackgroundTransparency=1; t.Text=text; t.TextColor3=color or UI.White; t.Font=Enum.Font.GothamBold
 t.TextSize=size or 18; t.TextXAlignment=Enum.TextXAlignment.Left; t.Parent=parent
 return t
end
function UI.Button(parent, text,x,y,w,h,color,callback)
 local b=Instance.new("TextButton"); b.Name=text; b.Position=UDim2.fromOffset(x,y); b.Size=UDim2.fromOffset(w,h)
 b.BackgroundColor3=color or UI.Cyan; b.TextColor3=UI.Navy; b.Font=Enum.Font.GothamBold; b.TextSize=18
 b.Text=text; b.BorderSizePixel=0; b.AutoButtonColor=true; b.Parent=parent
 b.Activated:Connect(callback)
 return b
end
function UI.Line(parent,x1,y1,x2,y2,color,thickness)
 local dx,dy=x2-x1,y2-y1
 local f=UI.PanelAt(parent,"Beam",(x1+x2)/2,(y1+y2)/2,math.sqrt(dx*dx+dy*dy),thickness or 2,color)
 f.AnchorPoint=Vector2.new(0.5,0.5); f.Rotation=math.deg(math.atan2(dy,dx)); return f
end
function UI.Glyph(parent,text,x,y,size,color)
 local g=UI.Label(parent,text,x-size/2,y-size/2,size,size,size,color)
 g.TextXAlignment=Enum.TextXAlignment.Center; return g
end
return UI
