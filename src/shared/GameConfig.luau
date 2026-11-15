-- Starfall tuning. Arena coordinates are independent of screen resolution.
local Config = {
 Width = 1000, Height = 550, Step = 1 / 30, Sync = 1 / 15,
 PlayerSpeed = 215, PlayerRadius = 12, Hull = 100,
 BeamInterval = 0.19, BeamRange = 420, BeamDamage = 16,
 DashSeconds = 0.17, DashSpeed = 790, DashCooldown = 2.6,
 StealSeconds = 2.0, StealRange = 76, StealCooldown = 4,
 PickupRange = 36, MaxEnemies = 24, MaxBullets = 100,
 Vaults = {
   {Name = "THE EMBER GATE", Subtitle = "Sector I", Enemy = "Shard", Cost = 0, Goal = 12, Threat = 1, Color = {255, 81, 112}},
   {Name = "THE AMBER DRIFT", Subtitle = "Sector II", Enemy = "Drifter", Cost = 45, Goal = 15, Threat = 2, Color = {255, 182, 67}},
   {Name = "THE VERDANT BELT", Subtitle = "Sector III", Enemy = "Lattice", Cost = 70, Goal = 18, Threat = 3, Color = {62, 235, 166}},
   {Name = "THE AZURE DEEP", Subtitle = "Sector IV", Enemy = "Lancer", Cost = 95, Goal = 20, Threat = 4, Color = {66, 178, 255}},
   {Name = "THE VIOLET THRONE", Subtitle = "Sector V", Enemy = "Titan", Cost = 120, Goal = 1, Threat = 5, Color = {184, 120, 255}},
  },
 Upgrades = {
  {Id = "Damage", Label = "BEAM", Detail = "+7 damage", Cost = 35, Max = 4},
  {Id = "Dash", Label = "DRIVE", Detail = "Faster recharge", Cost = 25, Max = 3},
  {Id = "Magnet", Label = "MAGNET", Detail = "+24 pickup radius", Cost = 20, Max = 3},
  {Id = "Shield", Label = "HULL", Detail = "+20 max / repair", Cost = 30, Max = 4},
 },
}
return Config
