export const MAP_FILE = 'assets/map.gltf';
export const MAP_SCALE = 0.110;

// -----------------------------
// MAP REGISTRY
// -----------------------------
// Multiple selectable maps. `id` is what gets stored/voted on over the
// network (Firebase, vote records) - keep it stable even if `name`
// changes later. `file`/`scale` feed straight into loadMap().
// ASSUMPTION: House uses the same scale as Construction for now (0.110) -
// adjust MAP_SCALE below once it's been walked in-engine, per earlier
// scale-check note.
export const MAPS = [
  { id: 'construction', name: 'Construction', file: 'assets/map.gltf', scale: 0.110 },
  { id: 'house', name: 'House', file: 'assets/skyscraper.gltf', scale: 0.110 },
];

export const DEFAULT_TARGET_LENGTH = 0.9;
export const DEFAULT_SCALE_MULTIPLIER = 3.0;

export const ANIM_NAMES = ['shoot', 'bolt', 'reload', 'reload1', 'reload2', 'inspect', 'rack'];

export const NORMAL_FOV = 70;
export const FAKE_SCOPE_FOV = 55;

export const MAX_BULLET_HOLES = 100;

// -----------------------------
// WEAPON LOADOUT (Strict Ordering)
// -----------------------------
export const WEAPON_CONFIGS = [
  {
    name: 'Pistol',
    file: 'assets/Pistol.gltf',
    slot: 'secondary',
    magSize: 12,
    fireMode: 'semi',
    damage: 7,
    position: [-0.02, -1.5, -1.5],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.11, -1.12, -0.7],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 60,
    scopedSensitivity: 0.75,
    recoilY: 0.045,
    recoilX: 0.025
  },
  {
    name: 'Rifle',
    file: 'assets/rifle.gltf',
    slot: 'primary',
    magSize: 30,
    fireMode: 'auto',
    fireRate: 20,
    damage: 7,
    position: [0.07, -0.42, -0.8],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.325, -0.365, -0.7],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 45,
    scopedSensitivity: 0.55,
    recoilY: 0.052,
    recoilX: 0.040
  },
  {
    name: 'Shotgun',
    file: 'assets/shotgun.gltf',
    slot: 'primary',
    magSize: 7,
    fireMode: 'semi',
    damage: 5,
    pellets: 8,
    spreadAngle: 0.06,
    position: [0.22, -0.55, -0.8],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.1, -0.4, -0.6],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 55,
    scopedSensitivity: 0.65,
    recoilY: 0.5,
    recoilX: 0.5
  },
  {
    name: 'Double Barrel',
    file: 'assets/db.gltf',
    slot: 'primary',
    magSize: 2,
    fireMode: 'semi',
    damage: 7,
    pellets: 12,
    spreadAngle: 0.1,
    position: [0.15, -0.48, -0.9],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.036, -0.35, -0.35],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 65,
    scopedSensitivity: 0.80,
    recoilY: 0.65,
    recoilX: 0.35
  },
  {
    name: 'SMG',
    file: 'assets/smg.gltf',
    slot: 'primary',
    magSize: 35,
    fireMode: 'auto',
    fireRate: 25,  
    damage: 3,
    position: [0.09, -0.65, -0.75],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.354, -0.433, -0.65],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 50,
    scopedSensitivity: 0.60,
    recoilY: 0.032,
    recoilX: 0.038
  },
  {
    name: 'Sniper',
    file: 'assets/sniper.gltf',
    slot: 'primary',
    magSize: 5,
    fireMode: 'semi',
    damage: 60,
    exemptFromFalloff: true,
    position: [0.1, -0.4, -1.0],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.0475, -0.2335, -0.6],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 25,
    scopedSensitivity: 0.30,
    recoilY: 0.25,
    recoilX: 0.05
  },
  {
    name: '.357',
    file: 'assets/357.gltf',
    slot: 'secondary',
    magSize: 6,
    fireMode: 'semi',
    damage: 15,
    exemptFromFalloff: true,
    reloadSpeedMult: 0.65,
    position: [-0.02, -1, -1],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.168, -0.745, -0.5],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 60,
    scopedSensitivity: 0.7,
    recoilY: 0.2,
    recoilX: 0.2
  },
  {
    // MELEE - a new weapon category, not a gun. slot: 'melee' means it never
    // takes a loadout pick (buildWeaponSelects only fills from 'secondary'/
    // 'primary' pools) - instead every player always has it, switchable via
    // the 'V' key regardless of loadout, on top of whatever guns they chose.
    // No scopedPosition/scopedFov/scopedSensitivity/scopedRotation fields -
    // melee can't ADS at all, so those are intentionally omitted rather
    // than set to some default; main.js blocks the right-click ADS input
    // outright when a melee weapon is equipped.
    // REQUIRES: Baton.gltf's single animation clip must be named "shoot"
    // (case-insensitive) in the GLTF, same convention every gun already
    // uses for its fire animation - the animation-loading code matches by
    // clip name, not by "first clip found".
    name: 'Baton',
    file: 'assets/Baton.gltf',
    slot: 'melee',
    fireMode: 'melee',
    damage: 35, // base damage, before the hitZones multiplier below
    swingCooldown: 0.6, // seconds between swings - melee has no magazine/ammo, this is its rate-of-fire equivalent
    // Distance-based damage zones (from the camera, along the swing's
    // raycast) - checked in order, first zone whose maxDistance covers the
    // hit's distance wins. The last zone's maxDistance is also used as the
    // weapon's total reach (raycaster.far) - anything farther simply
    // doesn't connect at all, no zone needed for "out of range".
    hitZones: [
      { maxDistance: 1.2, damageMult: 1.0 },  // full damage at close range
      { maxDistance: 2.0, damageMult: 0.6 },  // reduced damage at the edge of the swing's reach
    ],
    position: [0.05, -0.5, -0.7],
    rotation: [0, Math.PI, 0],
    recoilY: 0.03,
    recoilX: 0.02,
  }
];

export const ROOMS = ['Server 1', 'Server 2', 'Server 3', 'Server 4', 'Server 5'];

// -----------------------------
// GAME MODES (Phase 2 scaffold)
// -----------------------------
// scoreCap/timeLimitSec here drive the GENERIC win condition used by the
// match-state machine right now: first to scoreCap OR whichever score is
// highest when timeLimitSec runs out, using a placeholder "roundKills"
// counter. That's a stand-in - each mode's REAL scoring (team score for
// TDM, weapon-tier progress for Gun Game, capture time for KOTH, survivor/
// infected state for Infection) is Phase 3 work that plugs into this same
// phase machine without changing it. Numbers below are reasonable-guess
// defaults, easy to retune once actually playtested.
export const MODES = {
  tdm: {
    id: 'tdm', name: 'Team Deathmatch',
    description: 'Two teams. First to the score cap (or highest score when time runs out) wins.',
    scoreCap: 30, timeLimitSec: 5 * 60,
  },
  gungame: {
    id: 'gungame', name: 'Gun Game',
    description: 'Every kill upgrades your weapon. First to cycle through every weapon wins.',
    scoreCap: null, timeLimitSec: 7.5 * 60, // real win condition (reaching the final weapon tier) is Phase 3 - this scaffold just runs on the time limit alone for now
  },
  koth: {
    id: 'koth', name: 'King of the Hill',
    description: 'Hold the zone to score. First to the score cap (or highest score when time runs out) wins.',
    scoreCap: 100, timeLimitSec: 6 * 60,
  },
  oneshot: {
    id: 'oneshot', name: 'One-Shot Sniper',
    description: 'Sniper only, every hit is lethal. First to the score cap (or highest score when time runs out) wins.',
    scoreCap: 20, timeLimitSec: 5 * 60,
  },
  infection: {
    id: 'infection', name: 'Infection',
    description: 'One random player starts infected (pistol only, effective to 5 units). Infected win by converting everyone; survivors win if the timer runs out first.',
    scoreCap: null, timeLimitSec: 6 * 60, // real win condition (all players converted) is Phase 3 - runs on the time limit alone for now
  },
};
export const MODE_LIST = Object.values(MODES);

// -----------------------------
// MATCH STATE / VOTING TIMING
// -----------------------------
export const INTERMISSION_DURATION_MS = 8 * 1000;   // how long the post-match summary screen shows before mode voting opens
export const VOTE_PHASE_DURATION_MS = 15 * 1000;    // how long each of the two vote screens (mode, then map) stays open
export const MODE_VOTE_OPTIONS_COUNT = 3;           // "3 random modes are picked to allow players to vote"
export const MAP_VOTE_OPTIONS_COUNT = 5;            // "at max 5 random maps" - naturally capped by however many maps actually exist (currently 2)

// -----------------------------
// SPECIALS (perk classes) - chosen at loadout screen each life
// -----------------------------
// hpDelta: added to MAX_HP for that life
// speedMult: multiplies MOVE_SPEED
// scaleMult: multiplies player model/hitbox size (visual + collision, synced to others)
// ASSUMPTION: base headshot multiplier (applies to everyone, not special-specific)
export const HEADSHOT_MULTIPLIER = 2.0;

// ASSUMPTION: Heavy's "chance to swap a primary for Armor" - implemented as a
// 50% coin flip shown to the player right after they confirm their loadout.
export const HEAVY_ARMOR_SWAP_CHANCE = 0.5;
export const HEAVY_ARMOR_HP = 40; // flat, non-regenerating

export const SPECIALS = {
  heavy: {
    id: 'heavy', name: 'Heavy', subtitle: '"Who touched Sasha"',
    startLine: "Some people think they can outsmart me. Maybe, maybe. I've yet to meet one that can outsmart bullet.",
    hpDelta: 15, speedMult: 0.85, scaleMult: 1.075,
    description: '+15 HP, -15% speed, 7.5% larger. Chance to swap a primary for 40 armor (non-regen).',
  },
  slim: {
    id: 'slim', name: 'Slim', subtitle: '"Speedy boi"',
    startLine: 'Oh hey look a squirrel',
    hpDelta: -10, speedMult: 1.075, scaleMult: 0.95,
    lowHpThreshold: 50, lowHpSpeedMult: 1.075, lowHpScaleMult: 0.95, // stacks multiplicatively when under threshold
    description: '-10 HP, +7.5% speed, 5% smaller. Under 50 HP: another +7.5% speed and -5% size.',
  },
  sniper: {
    id: 'sniper', name: 'Sniper', subtitle: '"Pryvyd"',
    startLine: 'Привет! Пора надрать всем задницы!',
    recoilMult: 0.75, sniperDamageMult: 1.10, rangeDamageBonusPer25: 4,
    description: '25% less recoil on every gun. Sniper rifle deals 10% more. +2 dmg per 25 units traveled.',
  },
  bulletier: {
    id: 'bulletier', name: 'Bulletier', subtitle: '"Someone wouldn\'t stop asking for an SMG"',
    startLine: "Spray n' Pray",
    smgDamageMult: 1.05, smgFireRateMult: 1.05,
    lowHpThreshold: 75, smgLowHpSpeedMult: 1.05,
    description: 'SMGs: +5% damage, +5% fire rate. Under 75 HP while holding an SMG: +5% more speed.',
  },
  shotty: {
    id: 'shotty', name: 'Shotty', subtitle: '"Zomboid special"',
    startLine: '6 feet my guy, 6 feet!',
    shotgunSpreadMult: 0.80, shotgunDamageMult: 1.05,
    allowDoubleBarrelSecondary: true,
    description: 'Shotguns: -10% spread, +5% damage. Can pick Double Barrel as a secondary.',
  },
  cowboy: {
    id: 'cowboy', name: 'Wannabe Cowboy', subtitle: '"KaPOW!"',
    startLine: 'Not enough holes in that guy',
    maxPrimaries: 1,
    maxSecondaries: 2,
    pistolFireRateMult: 1.15,
    pistolReloadSpeedMult: 1.15,
    pistolHeadshotBonusMult: 1.25,
    doubleBarrelDamageMult: 1.015,
    doubleBarrelSpreadMult: 0.985,
    doubleBarrelAnimSpeedMult: 0.8,
    description: 'Forces loadout to 1 primary and 2 secondaries. Pistols: +15% fire rate/anim speed, +15% reload speed, headshots +25% extra damage. Double Barrel: +1.5% damage, -1.5% spread.',
  },
  lucky: {
    id: 'lucky', name: 'Lucky', subtitle: '"Somehow..."',
    startLine: 'They said this was a casino!',
    surviveLethalChance: 0.50, critChance: 0.05, critMult: 1.25,
    regenSpeedMult: 1.25, headshotInstaDownChance: 0.05,
    description: '10% chance to survive a lethal hit at 1 HP (once/life). 5% chance a shot deals +25%. Regen 15% faster. 0.5% headshot insta-down.',
  },
  florida: {
    id: 'florida', name: 'Florida Man', subtitle: '"Can\'t damage what isn\'t there."',
    startLine: 'Florida man steals ambulance, finishes beer before being arrested.',
    damageTakenMult: 0.95, shotgunRifleDamageMult: 1.025, speedMult: 1.05, scaleMult: 1.035,
    headshotImmune: true,
    description: 'Takes 5% less damage. Shotguns/rifles +2.5% damage. +5% speed, 3.5% larger. Immune to headshot bonus damage.',
  },
};
export const SPECIAL_LIST = Object.values(SPECIALS);

export const MAX_HP = 150;

// -----------------------------
// HP REGEN / RESPAWN
// -----------------------------
export const HP_REGEN_DELAY = 5;    // seconds since last damage before regen starts
export const HP_REGEN_RATE = 12;    // hp per second while regenerating
export const RESPAWN_DELAY = 3;     // seconds spent dead before respawning

// -----------------------------
// DEATH BOUNDARY
// -----------------------------
// Anyone falling below this Y (e.g. clipping out of the map, or falling off
// an edge with no floor below) dies instantly rather than falling forever.
export const DEATH_BOUNDARY_Y = -150;

// -----------------------------
// FALL DAMAGE
// -----------------------------
// No damage under this many units fallen. Past that, -5 HP per 2 units.
// Heavy takes +5% more fall damage, +2.5% more on top of that if their
// armor-swap coin flip landed on armor (checked in main.js via
// currentSpecial.id === 'heavy' && usingArmor).
export const FALL_DAMAGE_SAFE_DISTANCE = 2;
export const FALL_DAMAGE_PER_UNIT_INTERVAL = 2;
export const FALL_DAMAGE_PER_INTERVAL = 5;
export const HEAVY_FALL_DAMAGE_MULT = 1.05;
export const HEAVY_FALL_DAMAGE_ARMOR_MULT = 1.025; // stacks multiplicatively with the above

// -----------------------------
// DAMAGE FALLOFF BY RANGE
// -----------------------------
// -1 damage per 20 units traveled, for every weapon except ones flagged
// `exemptFromFalloff: true` in WEAPON_CONFIGS (Sniper, .357).
export const FALLOFF_UNIT_INTERVAL = 20;
export const FALLOFF_PER_INTERVAL = 1;

export const SPAWN_POINTS = [
  [74.25, 6.05, 14],
  [35.75, 2.6, 25],
  [33, 2.7, -11],
  [40, 9.65, -36],
  [74.4, 2.5, -37],
  [-26.5, 6.05, -52.75],
  [-12.7, 7.35, 25],
];

export const GRAPHICS_PROFILES = {
  'POTATO': { shadows: false, shadowRes: 0,    anisotropy: 1,  bloom: false, bloomSize: 0,   shadowFps: 0 },
  'LOW':    { shadows: true,  shadowRes: 720,  anisotropy: 2,  bloom: false, bloomSize: 0,   shadowFps: 5 },
  'MEDIUM': { shadows: true,  shadowRes: 1512, anisotropy: 4,  bloom: false, bloomSize: 0,   shadowFps: 10 },
  'HIGH':   { shadows: true,  shadowRes: 4028, anisotropy: 8,  bloom: true,  bloomSize: 64,  shadowFps: 25 },
  'ULTRA':  { shadows: true,  shadowRes: 6124, anisotropy: 12, bloom: true,  bloomSize: 128, shadowFps: 45 },
  'INSANE': { shadows: true,  shadowRes: 17500, anisotropy: 16, bloom: true,  bloomSize: 256, shadowFps: 60 }
};

export const ANTI_ALIASING_TIERS = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24];

// -----------------------------
// MOVEMENT / PHYSICS TUNING
// -----------------------------
export const MOVE_SPEED = 6;
export const SPRINT_MULTIPLIER = 1.6;
export const CROUCH_SPEED_MULTIPLIER = 0.2;
export const JUMP_SPEED = 7.5;
export const GRAVITY = 24;

export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.0;
export const PLAYER_RADIUS = 0.4;

export const LEAN_ANGLE = 20 * (Math.PI / 180);
export const LEAN_OFFSET = 0.45;

// -----------------------------
// CAMERA MOVEMENT EFFECT (HEAD BOB)
// -----------------------------
export const BOB_SMOOTHING = 10;
export const BOB_PROFILES = {
  idle:   { freq: 0.8, vertAmp: 0.006, horizAmp: 0.003 },
  walk:   { freq: 4, vertAmp: 0.04, horizAmp: 0.028 },
  sprint: { freq: 8, vertAmp: 0.08, horizAmp: 0.05 },
  crouch: { freq: 1.1, vertAmp: 0.012, horizAmp: 0.008 },
};
