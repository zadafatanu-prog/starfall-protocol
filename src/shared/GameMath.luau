-- Pure math adapted from HATCH & SNATCH. No Roblox runtime dependencies.
local GameMath = {}
function GameMath.StealSucceeds(rng, baseChance, rarityStars)
 return rng:NextNumber() < math.max(0.25, baseChance - (rarityStars - 1) * 0.08)
end
function GameMath.Normalize(x, y)
 local length = math.sqrt(x * x + y * y)
 if length < 0.0001 then return 0, 0 end
 return x / length, y / length
end
function GameMath.Distance(ax, ay, bx, by)
 return math.sqrt((ax - bx)^2 + (ay - by)^2)
end
function GameMath.IsFinite(value)
 return type(value) == "number" and value == value and math.abs(value) < math.huge
end
function GameMath.UpgradeCost(base, level)
 return base * (level + 1)
end
function GameMath.DashCooldown(level)
 return math.max(1, 2.6 - level * 0.45)
end
function GameMath.TitanPhase(hp, maxHP)
 if hp / maxHP > 0.66 then return 1 end
 if hp / maxHP > 0.33 then return 2 end
 return 3
end
function GameMath.FormatTime(seconds)
 seconds = math.max(0, math.floor(seconds))
 return string.format("%02d:%02d", math.floor(seconds / 60), seconds % 60)
end
return GameMath
