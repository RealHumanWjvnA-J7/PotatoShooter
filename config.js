export const MAP_FILE = 'assets/map.gltf';
export const MAP_SCALE = 0.110;

export const DEFAULT_TARGET_LENGTH = 0.9;
export const DEFAULT_SCALE_MULTIPLIER = 3.0;

export const ANIM_NAMES = ['shoot', 'bolt', 'reload', 'inspect', 'rack'];

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
    magSize: 7,
    fireMode: 'semi',
    damage: 5,
    pellets: 8,
    spreadAngle: 0.06,
    position: [0.22, -0.55, -1.25],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.1, -0.4, -0.9],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 60,
    scopedSensitivity: 0.65,
    recoilY: 0.5,
    recoilX: 0.5
  },
  {
    name: 'Double Barrel',
    file: 'assets/db.gltf',
    magSize: 2,
    fireMode: 'semi',
    damage: 7,
    pellets: 12,
    spreadAngle: 0.1,
    position: [0.15, -0.48, -1.1],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.17, -0.35, -0.8],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 65,
    scopedSensitivity: 0.80,
    recoilY: 0.65,
    recoilX: 0.35
  },
  {
    name: 'SMG',
    file: 'assets/smg.gltf',
    magSize: 40,
    fireMode: 'auto',
    fireRate: 25,  
    damage: 1.5,
    position: [0.09, -0.85, -0.75],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.28, -0.38, -0.65],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 50,
    scopedSensitivity: 0.60,
    recoilY: 0.032,
    recoilX: 0.038
  },
  {
    name: 'Sniper',
    file: 'assets/sniper.gltf',
    magSize: 5,
    fireMode: 'semi',
    damage: 60,
    position: [0.1, -0.4, -1.0],
    rotation: [0, Math.PI, 0],
    scopedPosition: [-0.0475, -0.2335, -0.8],
    scopedRotation: [0, Math.PI, 0],
    scopedFov: 25,
    scopedSensitivity: 0.30,
    recoilY: 0.15,
    recoilX: 0.05
  }
];

export const ROOMS = ['Server 1', 'Server 2', 'Server 3', 'Server 4', 'Server 5'];

export const MAX_HP = 150;

// -----------------------------
// HP REGEN / RESPAWN
// -----------------------------
export const HP_REGEN_DELAY = 5;    // seconds since last damage before regen starts
export const HP_REGEN_RATE = 12;    // hp per second while regenerating
export const RESPAWN_DELAY = 3;     // seconds spent dead before respawning
export const SPAWN_POINTS = [
  [50, 2.5, 0],
  [45, 2.5, 6],
  [55, 2.5, -6],
  [40, 2.5, -4],
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
