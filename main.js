import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  MAP_FILE, MAP_SCALE, DEFAULT_TARGET_LENGTH, DEFAULT_SCALE_MULTIPLIER,
  ANIM_NAMES, NORMAL_FOV, FAKE_SCOPE_FOV, MAX_BULLET_HOLES, WEAPON_CONFIGS,
  MAX_HP, GRAPHICS_PROFILES, ANTI_ALIASING_TIERS,
  HP_REGEN_DELAY, HP_REGEN_RATE, RESPAWN_DELAY, SPAWN_POINTS,
  MOVE_SPEED, SPRINT_MULTIPLIER, CROUCH_SPEED_MULTIPLIER, JUMP_SPEED, GRAVITY,
  STAND_HEIGHT, CROUCH_HEIGHT, PLAYER_RADIUS, LEAN_ANGLE, LEAN_OFFSET,
  BOB_SMOOTHING, BOB_PROFILES, ROOMS,
} from './config.js';
import { createUISystem } from './ui.js';
import { TargetCube } from './targetCube.js'; // IMPORTED TARGET CUBE
import { createNetworkSystem, loginOrSignUp, fetchRoomCounts, banPlayer } from './network.js';

// ENGINE SETTINGS
let playerHp = 150;
let isDead = false;
let lastDamageTime = -Infinity; // seconds, from performance.now()/1000
let respawnAt = 0;              // seconds, from performance.now()/1000

const settings = {
  debugTracers: false,
  wireframe: false,
  visiblePlayer: false,
  graphics: 'INSANE',
  msaaSamples: 12, 
  bloomEnabled: true,
  bobIntensity: 2
};

let network = null; // set up once the player picks a room on the connect overlay
let isAdmin = false;
let myUid = null;
let myDisplayName = 'Player';

let noclip = false;
let freecam = false;
const freecamPos = new THREE.Vector3();

let swayX = 0, swayY = 0;
let targetSwayX = 0, targetSwayY = 0;

// BASIC SCENE SETUP (WORLD LAYER)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88aabb);
scene.fog = new THREE.Fog(0x88aabb, 20, 200);

const cameraGroup = new THREE.Group(); 
scene.add(cameraGroup);

const camera = new THREE.PerspectiveCamera(NORMAL_FOV, window.innerWidth / window.innerHeight, 0.05, 1000);
cameraGroup.add(camera);

// OPTIMIZED: Native WebGL Anti-Aliasing enabled (antialias: true) replacing the redundant render target
const renderer = new THREE.WebGLRenderer({ antialias: true }); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.autoClear = false; 

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
renderer.shadowMap.autoUpdate = false;
let shadowTimer = 0;

document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.08;
sun.shadow.radius = 4.0;

scene.add(sun);
scene.add(sun.target);

const fallbackGround = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  new THREE.MeshStandardMaterial({ color: 0x557733 })
);
fallbackGround.rotation.x = -Math.PI / 2;
scene.add(fallbackGround);

// INSTANTIATE THE TARGET CUBE
const myTarget = new TargetCube(scene);

// VIEWMODEL OVERLAY LAYER
const viewmodelScene = new THREE.Scene();
const viewmodelCamera = new THREE.PerspectiveCamera(NORMAL_FOV, window.innerWidth / window.innerHeight, 0.05, 10);

viewmodelScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
const viewmodelSun = new THREE.DirectionalLight(0xffffff, 1.5);
viewmodelSun.position.set(50, 80, 30);
viewmodelScene.add(viewmodelSun);

const weaponRig = new THREE.Group();
viewmodelScene.add(weaponRig);

let currentHeight = STAND_HEIGHT;

const hitboxGeo = new THREE.CapsuleGeometry(PLAYER_RADIUS, STAND_HEIGHT - PLAYER_RADIUS * 2, 4, 8);
const hitboxMat = new THREE.MeshStandardMaterial({ 
  color: 0x00ff00, 
  wireframe: true,
  roughness: 0.5,
  metalness: 0.1
});
const playerHitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
playerHitbox.castShadow = true;
playerHitbox.receiveShadow = true;
scene.add(playerHitbox);

// -----------------------------
// SETTINGS MENU + GRAPHICS/BLOOM SYSTEM
// -----------------------------
const activeTracers = [];
const controls = new PointerLockControls(cameraGroup, document.body);

const { toggleMenu, applyGraphicsSettings, sunGroup, updateScoreboard, setAdminMode } = createUISystem({
  scene, sun, renderer, settings, GRAPHICS_PROFILES, ANTI_ALIASING_TIERS,
  getCollidables: () => collidables,
  activeTracers,
  controls,
});

// BULLET HOLES & TRACERS
const bulletHoles = [];
const bulletHoleGeo = new THREE.CircleGeometry(0.04, 12);
const bulletHoleMat = new THREE.MeshBasicMaterial({ 
  color: 0x111111,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4 
});

// GLOBAL STATIC MATH OBJECTS (SCRATCHPAD FOR ZERO-ALLOCATION LOOP PERFORMANCE)
const VEC_UP = new THREE.Vector3(0, 1, 0);
const VEC_DOWN = new THREE.Vector3(0, -1, 0);
const WALL_DIRECTIONS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1)
];

const _scratchPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _rightDir = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _scratchVec2D = new THREE.Vector2();
const _cameraWorldPos = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();
const _worldNormal = new THREE.Vector3();

const _rayDown = new THREE.Raycaster();
const _rayUp = new THREE.Raycaster();
const _rayHoriz = new THREE.Raycaster();

// PLAYER / MOVEMENT CONFIG
const playerPos = new THREE.Vector3(50, 2.5, 0);
cameraGroup.position.copy(playerPos);

const blocker = document.getElementById('blocker');
blocker.addEventListener('click', () => {
  if (document.getElementById('game-menu').style.display !== 'none') return;
  controls.lock();
});
controls.addEventListener('lock', () => blocker.style.display = 'none');
controls.addEventListener('unlock', () => {
  if (document.getElementById('game-menu').style.display === 'none') {
    blocker.style.display = 'flex';
  }
});

const keys = {};
document.addEventListener('keydown', (e) => keys[e.code] = true);
document.addEventListener('keyup', (e) => keys[e.code] = false);

document.addEventListener('mousemove', (e) => {
  if (controls.isLocked) {
    const w = W();
    let swayMultiplier = 1.0;
    
    if (scoped && w && w.loaded && w.cfg.scopedSensitivity !== undefined) {
      swayMultiplier = w.cfg.scopedSensitivity;
    }
    
    targetSwayX += e.movementX * 0.0004 * swayMultiplier;
    targetSwayY += e.movementY * 0.0004 * swayMultiplier;
  }
});

// MOUSE SCROLL WHEEL - WEAPON SWITCHING SYSTEM
document.addEventListener('wheel', (e) => {
  if (!controls.isLocked) return;
  
  const step = e.deltaY > 0 ? 1 : -1;
  let targetIndex = currentIndex;
  
  for (let i = 0; i < weapons.length; i++) {
    targetIndex = (targetIndex + step + weapons.length) % weapons.length;
    if (weapons[targetIndex].loaded) {
      switchWeapon(targetIndex);
      break;
    }
  }
}, { passive: true });

let verticalVelocity = 0;
let grounded = false;

let recoilX = 0;
let recoilY = 0;
let targetRecoilX = 0;
let targetRecoilY = 0;

let currentFov = NORMAL_FOV;
let currentLean = 0;

// CAMERA MOVEMENT EFFECT (HEAD BOB)
let bobTimer = 0;
let currentVertAmp = 0;
let currentHorizAmp = 0;

let moveState = { moving: false, sprinting: false, crouching: false };
let collidables = [fallbackGround, myTarget.mesh]; // PUSHED ON BOOTSTRAP

const loader = new GLTFLoader();
const clock = new THREE.Clock();

const hud = document.getElementById('hud');
function setHud(lines) {
  hud.textContent = lines.join('\n');
}

let scoped = false;
let leftMouseDown = false;

const weapons = WEAPON_CONFIGS.map((cfg) => ({
  cfg,
  loaded: false,
  pivot: null,
  mixer: null,
  clips: {},
  actions: {},
  boltAction: false,
  hasRealAds: false,
  basePos: null,
  baseRot: null,
  scopedPos: null,
  scopedRot: null,
  adsAction: null,
  ammo: cfg.magSize,
  isBusy: false,
  isReloading: false,
  waitingForBolt: false,
  fireTimer: 0,
}));

let currentIndex = 0;
function W() { return weapons[currentIndex]; }

function loadWeaponAssets(index) {
  const w = weapons[index];
  const cfg = w.cfg;

  loader.load(
    cfg.file,
    (gltf) => {
      const weaponModel = gltf.scene;
      weaponModel.updateMatrixWorld(true);

      const box = new THREE.Box3();
      let hasMesh = false;
      weaponModel.traverse((obj) => {
        if (obj.isMesh && obj.geometry) {
          obj.geometry.computeBoundingBox();
          box.union(obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld));
          hasMesh = true;
          
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      if (!hasMesh) box.setFromObject(weaponModel);

      const size = new THREE.Vector3();
      box.getSize(size);
      const longestDim = Math.max(size.x, size.y, size.z) || 1;
      const targetLength = cfg.targetLength ?? DEFAULT_TARGET_LENGTH;
      const scaleMultiplier = cfg.scaleMultiplier ?? DEFAULT_SCALE_MULTIPLIER;
      
      const center = new THREE.Vector3();
      box.getCenter(center);

      weaponModel.position.sub(center); 
      const pivot = new THREE.Group();
      pivot.add(weaponModel);
      pivot.scale.setScalar((targetLength / longestDim) * scaleMultiplier);
      
      pivot.rotation.set(...(cfg.rotation || [0, Math.PI, 0]));
      pivot.position.set(...(cfg.position || [0, -0.38, -0.6]));

      pivot.visible = (index === currentIndex);
      weaponRig.add(pivot);

      w.pivot = pivot;
      w.basePos = pivot.position.clone();
      w.baseRot = pivot.quaternion.clone();
      w.scopedRot = w.baseRot.clone(); 

      if (cfg.scopedPosition) {
        w.scopedPos = new THREE.Vector3(...cfg.scopedPosition);
        if (cfg.scopedRotation) w.scopedRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(...cfg.scopedRotation));
        w.hasRealAds = true;
      } 

      if (gltf.animations) {
        w.mixer = new THREE.AnimationMixer(weaponModel);
        gltf.animations.forEach((clip) => w.clips[clip.name.toLowerCase()] = clip);
      }

      ANIM_NAMES.forEach((name) => {
        if (w.clips[name]) {
          w.actions[name] = w.mixer.clipAction(w.clips[name]);
          w.actions[name].clampWhenFinished = true;
          w.actions[name].loop = THREE.LoopOnce;
        }
      });

      w.boltAction = ((cfg.name === 'Shotgun') || (cfg.name === 'Sniper') || !!w.actions['bolt'] || !!w.actions['rack']) && cfg.name !== 'Double Barrel';
      
      w.loaded = true;
      updateHud();
      reportAssetLoaded();
    },
    undefined,
    (err) => { console.error(`Failed to load weapon:`, err); updateHud(); reportAssetLoaded(); }
  );
}

function loadMap(path) {
  loader.load(
    path,
    (gltf) => {
      scene.remove(fallbackGround);
      gltf.scene.scale.setScalar(MAP_SCALE);
      scene.add(gltf.scene);
      gltf.scene.updateMatrixWorld(true);

      collidables = [];
      gltf.scene.traverse((obj) => {
        if (obj.isMesh) {
          collidables.push(obj);
        }
      });
      if (collidables.length === 0) collidables = [fallbackGround];
      
      // MAINTAIN TARGET IN ENVIRONMENT RAYCAST STACK ACROSS RELOADS
      collidables.push(myTarget.mesh);
      
      applyGraphicsSettings();
      reportAssetLoaded();
    },
    undefined,
    (err) => { 
      collidables = [fallbackGround, myTarget.mesh]; 
      reportAssetLoaded();
    }
  );
}

function playAnim(w, name, { onFinish } = {}) {
  const action = w.actions[name];
  if (!action) { if (onFinish) onFinish(); return false; }
  
  w.mixer.stopAllAction();
  
  action.reset();
  action.play();
  if (onFinish) {
    const onDone = (e) => {
      if (e.action === action) { w.mixer.removeEventListener('finished', onDone); onFinish(); }
    };
    w.mixer.addEventListener('finished', onDone);
  }
  return true;
}

function updateHud() {
  let lines = [`HP: ${Math.floor(playerHp)} / ${MAX_HP}`];
  if (noclip) lines[0] += " | [NOCLIP]";
  if (freecam) lines[0] += " | [FREECAM]";

  if (isDead) {
    const secsLeft = Math.max(0, Math.ceil(respawnAt - performance.now() / 1000));
    lines = [`YOU DIED - respawning in ${secsLeft}...`];
    setHud(lines);
    return;
  }

  lines.push(WEAPON_CONFIGS.map((cfg, i) => {
    const tag = weapons[i].loaded ? cfg.name : `${cfg.name} (missing)`;
    return i === currentIndex ? `[${i + 1}:${tag}]` : `${i + 1}:${tag}`;
  }).join('  '));

  const w = W();
  if (w.loaded) {
    lines.push(`AMMO: ${w.ammo}/${w.cfg.magSize}`);
    if (w.waitingForBolt) lines.push(w.actions['rack'] ? 'CHAMBER EMPTY: PUMP (LMB / T)' : 'CHAMBER EMPTY: BOLT (LMB / T)');
    if (w.isReloading) lines.push('RELOADING...');
  } else {
    lines.push(`Loading ${w.cfg.name}...`);
  }
  setHud(lines);
}

function tryShoot() {
  const w = W();
  if (!w.loaded || w.isBusy || w.isReloading) return; 
  if (w.waitingForBolt) { tryBolt(); return; }
  if (w.ammo <= 0) return;

  w.ammo--; w.isBusy = true;
  playAnim(w, 'shoot', {
    onFinish: () => {
      w.isBusy = false;
      if (w.boltAction) w.waitingForBolt = true;
      updateHud();
    }
  });

  const kickY = w.cfg.recoilY ?? 0.02;
  const kickX = w.cfg.recoilX ?? 0.01;
  targetRecoilX += kickY;
  targetRecoilY += (Math.random() - 0.5) * kickX;

  if (w.cfg.pellets && w.cfg.pellets > 1) {
    const pelletCount = w.cfg.pellets;
    const spread = w.cfg.spreadAngle ?? 0.05;
    for (let i = 0; i < pelletCount; i++) {
      const offsetX = (Math.random() - 0.5) * spread;
      const offsetY = (Math.random() - 0.5) * spread;
      raycastHit(offsetX, offsetY);
    }
  } else {
    raycastHit(0, 0);
  }

  if (network) {
    camera.getWorldPosition(_cameraWorldPos);
    camera.getWorldDirection(_forward);
    network.sendShoot(_cameraWorldPos, _forward, currentIndex);
  }

  updateHud();
}

function tryBolt() {
  const w = W();
  if (!w.loaded || w.isBusy || w.isReloading) return; 
  if (!w.waitingForBolt && w.ammo > 0) w.ammo--;

  w.isBusy = true;
  updateHud();

  const animToPlay = w.actions['rack'] ? 'rack' : (w.actions['bolt'] ? 'bolt' : null);
  const finalizeBolt = () => { w.isBusy = false; w.waitingForBolt = false; updateHud(); };

  if (animToPlay) {
    playAnim(w, animToPlay, { onFinish: finalizeBolt });
  } else {
    finalizeBolt();
  }
}

function tryReload() {
  const w = W();
  if (!w.loaded || w.isBusy || w.isReloading || w.ammo >= w.cfg.magSize) return;
  w.isReloading = true; w.isBusy = true;
  updateHud();
  playAnim(w, 'reload', {
    onFinish: () => {
      w.ammo = w.cfg.magSize; w.isReloading = false; w.isBusy = false; w.waitingForBolt = false;
      updateHud();
    }
  });
}

function tryInspect() {
  const w = W();
  if (!w.loaded || w.isBusy || w.isReloading) return;
  w.isBusy = true; playAnim(w, 'inspect', { onFinish: () => w.isBusy = false });
}

function switchWeapon(index) {
  if (index === currentIndex || index < 0 || index >= weapons.length) return;
  if (!weapons[index].loaded) return; 

  if (scoped) setScope(false);
  const prev = W();
  if (prev.pivot) prev.pivot.visible = false;
  currentIndex = index;
  if (weapons[currentIndex].pivot) weapons[currentIndex].pivot.visible = true;
  updateHud();
}

function raycastHit(offsetX = 0, offsetY = 0) {
  const raycaster = new THREE.Raycaster();
  _scratchVec2D.set(offsetX, offsetY);
  raycaster.setFromCamera(_scratchVec2D, camera);

  const hits = raycaster.intersectObjects(collidables, true);
  const wallDist = hits.length ? hits[0].distance : Infinity;

  // Check remote players too, since they're not part of `collidables`.
  // Only counts as a hit if it's actually closer than the nearest wall -
  // otherwise you'd be shooting someone through solid geometry.
  if (network) {
    const remoteMeshes = network.getRemotePlayerMeshes();
    if (remoteMeshes.length > 0) {
      const playerHits = raycaster.intersectObjects(remoteMeshes, true);
      if (playerHits.length > 0 && playerHits[0].distance < wallDist) {
        const hitId = playerHits[0].object.userData.remotePlayerId;
        if (hitId) {
          const dmg = W().cfg.damage || 25;
          network.sendHit(hitId, dmg);
        }
      }
    }
  }

  if (hits.length) {
    const hit = hits[0];
    
    // RAYCAST DAMAGE PROCESSING BLOCK
    if (hit.object.userData.isTargetCube) {
      const dmg = W().cfg.damage || 25; 
      hit.object.userData.parentInstance.takeDamage(dmg);
    }
    
    const hole = new THREE.Mesh(bulletHoleGeo, bulletHoleMat);
    hole.position.copy(hit.point);
    
    if (hit.face) {
      _normalMatrix.getNormalMatrix(hit.object.matrixWorld);
      _worldNormal.copy(hit.face.normal).applyMatrix3(_normalMatrix).normalize();
      _scratchPos.copy(hole.position).add(_worldNormal);
      hole.lookAt(_scratchPos);
    }
    
    scene.add(hole);
    bulletHoles.push(hole);
    if (bulletHoles.length > MAX_BULLET_HOLES) scene.remove(bulletHoles.shift());

    if (settings.debugTracers) {
      camera.getWorldPosition(_cameraWorldPos);
      const tMat = new THREE.LineBasicMaterial({ color: 0xffea00 });
      const tGeo = new THREE.BufferGeometry().setFromPoints([_cameraWorldPos, hit.point]);
      const line = new THREE.Line(tGeo, tMat);
      scene.add(line);
      activeTracers.push({ mesh: line, permanent: true });
    }
  }
}

document.addEventListener('mousedown', (e) => {
  if (!controls.isLocked) return;
  if (e.button === 0) { leftMouseDown = true; tryShoot(); }
  if (e.button === 2) setScope(true); 
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) leftMouseDown = false;
  if (e.button === 2) setScope(false);
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); toggleMenu(); return; }
  if (!isAdmin) {
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') return; // debug tools, admin only
  } else {
    if (e.code === 'BracketLeft') { noclip = !noclip; if (noclip) { verticalVelocity = 0; grounded = true; } updateHud(); return; }
    if (e.code === 'BracketRight') { freecam = !freecam; if (freecam) freecamPos.copy(cameraGroup.position); updateHud(); return; }
  }

  if (!controls.isLocked) return;
  switch (e.code) {
    case 'KeyR': tryReload(); break;
    case 'KeyH': tryInspect(); break;
    case 'KeyT': tryBolt(); break; 
    case 'Space':
      if (grounded && !noclip && !freecam) { verticalVelocity = JUMP_SPEED; grounded = false; }
      break;
    default:
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) switchWeapon(parseInt(m[1], 10) - 1);
  }
});

function setScope(on) {
  scoped = on;
  const w = W();
  const crosshair = document.getElementById('crosshair');
  if (crosshair) crosshair.style.display = on ? 'none' : 'block';

  const scopeUi = document.getElementById('scope');
  const useFakeScope = !w.loaded || !w.hasRealAds;
  if (scopeUi) scopeUi.style.display = (on && useFakeScope) ? 'block' : 'none';
  
  if (w.pivot) w.pivot.visible = true;

  controls.pointerSpeed = (on && w.loaded && w.cfg.scopedSensitivity !== undefined) ? w.cfg.scopedSensitivity : 1.0;
  updateHud();
}

window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  viewmodelCamera.aspect = aspect;
  viewmodelCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// -----------------------------
// DAMAGE FEEDBACK / KILL FEED
// -----------------------------
const damageVignette = document.getElementById('damage-vignette');
function flashDamage(amount) {
  const intensity = Math.min(1, amount / 40); // scales with hit size, caps out
  damageVignette.style.boxShadow = `inset 0 0 ${80 + intensity * 60}px ${20 + intensity * 20}px rgba(255,0,0,${0.35 + intensity * 0.35})`;
  clearTimeout(flashDamage._t);
  flashDamage._t = setTimeout(() => { damageVignette.style.boxShadow = 'inset 0 0 0 0 rgba(255,0,0,0)'; }, 220);
}

const killFeedEl = document.getElementById('kill-feed');
function pushKillFeed(text) {
  const line = document.createElement('div');
  line.textContent = text;
  killFeedEl.appendChild(line);
  setTimeout(() => { line.style.opacity = '0'; }, 4000);
  setTimeout(() => { line.remove(); }, 6000);
  while (killFeedEl.children.length > 5) killFeedEl.removeChild(killFeedEl.firstChild);
}

// -----------------------------
// HP / DEATH / RESPAWN
// -----------------------------
function die(killerName = null) {
  if (isDead) return;
  isDead = true;
  playerHp = 0;
  respawnAt = performance.now() / 1000 + RESPAWN_DELAY;
  leftMouseDown = false;
  if (controls.isLocked) controls.unlock();
  if (network) network.sendDeath(killerName);
  updateHud();
}

function respawn() {
  const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  playerPos.set(spawn[0], spawn[1], spawn[2]);
  cameraGroup.position.copy(playerPos);
  verticalVelocity = 0;
  grounded = true;
  playerHp = MAX_HP;
  isDead = false;
  lastDamageTime = performance.now() / 1000;
  updateHud();
}

// PHYSICS & MOVEMENT
function groundHeightAt(x, z, camY) {
  const bottomSphereCenterY = camY - (currentHeight - PLAYER_RADIUS);
  _scratchPos.set(x, bottomSphereCenterY + 0.1, z);
  _rayDown.set(_scratchPos, VEC_DOWN);
  const hits = _rayDown.intersectObjects(collidables, true);
  return hits.length ? hits[0].point.y : null;
}

function resolveWallCollisions(pos, currentHeight) {
  const checkHeights = [-currentHeight + PLAYER_RADIUS, -currentHeight * 0.5, -0.2];
  
  for (let h of checkHeights) {
    for (let dir of WALL_DIRECTIONS) {
      _scratchPos.set(pos.x, pos.y + h, pos.z);
      _rayHoriz.set(_scratchPos, dir);
      _rayHoriz.far = PLAYER_RADIUS;
      const hits = _rayHoriz.intersectObjects(collidables, true);
      if (hits.length > 0) {
        const hit = hits[0];
        const penetration = PLAYER_RADIUS - hit.distance;
        if (penetration > 0) {
          pos.addScaledVector(dir, -penetration);
        }
      }
    }
  }
}

function movePlayer(delta) {
  const forwardInput = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const rightInput = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  
  camera.getWorldDirection(_forward); 
  _rightDir.crossVectors(_forward, VEC_UP).normalize();

  if (!noclip && !freecam) {
    _forward.y = 0;
    _forward.normalize();
  }

  let speed = MOVE_SPEED;
  if (keys['ShiftLeft'] || keys['ShiftRight']) speed *= SPRINT_MULTIPLIER;

  _wish.set(0, 0, 0)
    .addScaledVector(_forward, forwardInput)
    .addScaledVector(_rightDir, rightInput);
  
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(speed * delta);

  if (freecam) {
    freecamPos.add(_wish);
    cameraGroup.position.copy(freecamPos);
    return;
  }

  if (noclip) {
    playerPos.add(_wish);
    cameraGroup.position.copy(playerPos);
    if (settings.visiblePlayer) playerHitbox.position.copy(playerPos).y -= (currentHeight / 2);
    return;
  }

  const wannaCrouch = keys['KeyC'] || keys['ControlLeft'] || keys['ControlRight'];
  let targetHeight = STAND_HEIGHT;

  if (wannaCrouch) {
    targetHeight = CROUCH_HEIGHT;
  } else if (currentHeight < STAND_HEIGHT) {
    _rayUp.set(playerPos, VEC_UP);
    _rayUp.far = (STAND_HEIGHT - currentHeight) + 0.2;
    if (_rayUp.intersectObjects(collidables, true).length > 0) targetHeight = CROUCH_HEIGHT;
  }

  currentHeight = THREE.MathUtils.lerp(currentHeight, targetHeight, delta * 12);
  const crouching = currentHeight < STAND_HEIGHT - 0.15;
  if (crouching) speed = MOVE_SPEED * CROUCH_SPEED_MULTIPLIER;

  moveState.moving = _wish.lengthSq() > 0 && grounded;
  moveState.sprinting = (keys['ShiftLeft'] || keys['ShiftRight']) && !crouching;
  moveState.crouching = crouching;

  playerPos.add(_wish);
  resolveWallCollisions(playerPos, currentHeight);

  const groundHit = groundHeightAt(playerPos.x, playerPos.z, playerPos.y);
  const groundY = (groundHit === null ? -9999 : groundHit) + currentHeight;

  if (playerPos.y > groundY + 0.05) {
    grounded = false;
    verticalVelocity -= GRAVITY * delta;
    playerPos.y += verticalVelocity * delta;
    if (verticalVelocity > 0) {
      _rayUp.set(playerPos, VEC_UP);
      _rayUp.far = 0.3; 
      if (_rayUp.intersectObjects(collidables, true).length > 0) verticalVelocity = 0; 
    }
    if (playerPos.y < groundY) { playerPos.y = groundY; verticalVelocity = 0; grounded = true; }
  } else if (verticalVelocity <= 0) {
    playerPos.y = groundY; verticalVelocity = 0; grounded = true;
  } else {
    playerPos.y += verticalVelocity * delta;
    verticalVelocity -= GRAVITY * delta;
    grounded = false;
  }

  cameraGroup.position.copy(playerPos);
  
  playerHitbox.position.copy(playerPos);
  playerHitbox.position.y -= (currentHeight / 2);
  playerHitbox.scale.y = currentHeight / STAND_HEIGHT;
  
  const profile = GRAPHICS_PROFILES[settings.graphics];
  if (profile.shadows) {
    sun.position.set(playerPos.x + 45, playerPos.y + 75, playerPos.z + 25);
    sun.target.position.copy(playerPos);
    sun.target.updateMatrixWorld();
  }

  sunGroup.position.set(playerPos.x + 450, playerPos.y + 750, playerPos.z + 250);
}

let scoreboardRefreshTimer = 0;

// MAIN LOOP & OFFSETS
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1); 

  // TICK THE TARGET TRACKER
  myTarget.update();

  if (isDead) {
    if (performance.now() / 1000 >= respawnAt) respawn();
    updateHud();
  } else if (playerHp < MAX_HP && (performance.now() / 1000 - lastDamageTime) >= HP_REGEN_DELAY) {
    playerHp = Math.min(MAX_HP, playerHp + HP_REGEN_RATE * delta);
    updateHud();
  }

  if (network) {
    network.update(delta, playerPos, cameraGroup.rotation.y, currentIndex, playerHp, moveState.crouching, currentLean);
  }

  if (controls.isLocked) {
    movePlayer(delta);
  } else {
    moveState.moving = false; moveState.sprinting = false;
  }

  targetSwayX = THREE.MathUtils.lerp(targetSwayX, 0, delta * 10);
  targetSwayY = THREE.MathUtils.lerp(targetSwayY, 0, delta * 10);
  swayX = THREE.MathUtils.lerp(swayX, targetSwayX, delta * 15);
  swayY = THREE.MathUtils.lerp(swayY, targetSwayY, delta * 15);

  let profile = !grounded ? null : (moveState.crouching ? BOB_PROFILES.crouch : 
                 (!moveState.moving ? BOB_PROFILES.idle : 
                 (moveState.sprinting ? BOB_PROFILES.sprint : BOB_PROFILES.walk)));

  const targetVert = profile ? profile.vertAmp * settings.bobIntensity : 0;
  const targetHoriz = profile ? profile.horizAmp * settings.bobIntensity : 0;
  
  currentVertAmp = THREE.MathUtils.lerp(currentVertAmp, targetVert, Math.min(1, delta * BOB_SMOOTHING));
  currentHorizAmp = THREE.MathUtils.lerp(currentHorizAmp, targetHoriz, Math.min(1, delta * BOB_SMOOTHING));
  bobTimer += delta * (profile ? profile.freq : 1);

  const bobVert = Math.sin(bobTimer * 2) * currentVertAmp; 
  const bobHoriz = Math.cos(bobTimer) * currentHorizAmp;

  let targetLeanAngle = 0;
  if (controls.isLocked) {
    if (keys['KeyQ']) targetLeanAngle = LEAN_ANGLE;       
    else if (keys['KeyE']) targetLeanAngle = -LEAN_ANGLE; 
  }
  currentLean = THREE.MathUtils.lerp(currentLean, targetLeanAngle, delta * 8);
  const leanOffsetAmt = (currentLean / LEAN_ANGLE) * -LEAN_OFFSET;

  targetRecoilX = THREE.MathUtils.lerp(targetRecoilX, 0, delta * 6);
  targetRecoilY = THREE.MathUtils.lerp(targetRecoilY, 0, delta * 6);
  recoilX = THREE.MathUtils.lerp(recoilX, targetRecoilX, delta * 20);
  recoilY = THREE.MathUtils.lerp(recoilY, targetRecoilY, delta * 20);

  // 1. Primary physical camera modifications (World Layer Viewport)
  camera.position.set(leanOffsetAmt + bobHoriz, bobVert, 0);
  camera.rotation.set(recoilX, recoilY, currentLean, 'YXZ');

  // FIXED: Keep the viewmodel overlay camera cleanly isolated at the origin.
  viewmodelCamera.position.set(0, 0, 0);
  viewmodelCamera.rotation.set(0, 0, 0);

  const adsModifier = scoped ? 0.0 : 1.0; 

  // 2. Viewmodel Position Secondary Offsets (Sway lag, movement inertias, recoil kick)
  let vmX = -swayX * 0.4 * adsModifier;       
  let vmY = swayY * 0.4 * adsModifier;
  let vmZ = recoilX * -0.3; 

  vmX -= bobHoriz * 0.08 * adsModifier;       
  vmY -= bobVert * 0.08 * adsModifier;
  vmX += leanOffsetAmt * 0.3 * adsModifier; 

  weaponRig.position.set(vmX, vmY, vmZ);

  // 3. Viewmodel Rotation Secondary Offsets (Sway twisting, weapon shooting snaps, procedural lean)
  let rotX = swayY * 0.12 * adsModifier;      
  let rotY = -swayX * 0.12 * adsModifier;
  let rotZ = currentLean * 1.0 * adsModifier;                   

  const fireKickModifier = scoped ? 0.08 : 0.25;
  rotX += recoilX * fireKickModifier;                       
  rotY += recoilY * fireKickModifier;                       

  weaponRig.rotation.set(rotX, rotY, rotZ, 'YXZ');

  const w = W();
  const tFov = scoped ? (w.loaded && w.cfg.scopedFov ? w.cfg.scopedFov : FAKE_SCOPE_FOV) : NORMAL_FOV;
  if (Math.abs(currentFov - tFov) > 0.1) {
    currentFov = THREE.MathUtils.lerp(currentFov, tFov, delta * 15);
    camera.fov = currentFov;
    viewmodelCamera.fov = currentFov;
    camera.updateProjectionMatrix();
    viewmodelCamera.updateProjectionMatrix();
  }

  if (w.mixer) w.mixer.update(delta);
  if (w.pivot && w.hasRealAds) {
    w.pivot.position.lerp(scoped ? w.scopedPos : w.basePos, 1 - Math.pow(0.001, delta));
    w.pivot.quaternion.slerp(scoped ? w.scopedRot : w.baseRot, 1 - Math.pow(0.001, delta));
  }

  if (controls.isLocked && leftMouseDown && w.loaded && w.cfg.fireMode === 'auto') {
    w.fireTimer += delta;
    const interval = 1 / (w.cfg.fireRate || 8);
    while (w.fireTimer >= interval) { w.fireTimer -= interval; tryShoot(); }
  }

  for (let i = activeTracers.length - 1; i >= 0; i--) {
    const t = activeTracers[i];
    if (!t.permanent) {
      t.life -= delta * 3; 
      if (t.life <= 0) { scene.remove(t.mesh); activeTracers.splice(i, 1); }
      else { t.mesh.material.transparent = true; t.mesh.material.opacity = t.life; }
    }
  }

  playerHitbox.visible = settings.visiblePlayer;

  const gameMenuEl = document.getElementById('game-menu');
  if (gameMenuEl && gameMenuEl.style.display !== 'none') {
    scoreboardRefreshTimer += delta;
    if (scoreboardRefreshTimer >= 0.5) {
      scoreboardRefreshTimer = 0;
      const rows = network ? network.getScoreboard() : [];
      updateScoreboard(rows, isAdmin, (targetUid) => {
        if (confirm('Ban this player? They will be blocked from logging in again.')) {
          banPlayer(targetUid).catch((err) => alert('Ban failed: ' + err.message));
        }
      });
    }
  }

  sunGroup.children.forEach(sprite => {
    sprite.lookAt(cameraGroup.position);
  });

  const graphicsProfile = GRAPHICS_PROFILES[settings.graphics];
  if (graphicsProfile.shadows && graphicsProfile.shadowFps > 0) {
    shadowTimer += delta;
    const shadowInterval = 1 / graphicsProfile.shadowFps;
    if (shadowTimer >= shadowInterval) {
      renderer.shadowMap.needsUpdate = true;
      shadowTimer = shadowTimer % shadowInterval;
    }
  }

  // OPTIMIZED: SINGLE-PASS DEPTH LAYERING (Eliminates Double Render)
  renderer.setRenderTarget(null);
  renderer.clear(true, true, true);

  // Pass 1: Render the main world environment
  renderer.render(scene, camera);

  // Pass 2: Isolate the weapon overlay depth layer to prevent clipping
  renderer.clearDepth();
  renderer.render(viewmodelScene, viewmodelCamera);
}

// -----------------------------
// MULTIPLAYER CONNECT OVERLAY
// -----------------------------
function drawRemoteTracer(originArr, dirArr) {
  const origin = new THREE.Vector3(...originArr);
  const dir = new THREE.Vector3(...dirArr);
  const end = origin.clone().addScaledVector(dir, 60);

  const tMat = new THREE.LineBasicMaterial({ color: 0xff5533 });
  const tGeo = new THREE.BufferGeometry().setFromPoints([origin, end]);
  const line = new THREE.Line(tGeo, tMat);
  scene.add(line);
  activeTracers.push({ mesh: line, life: 1, permanent: false });
}

function startNetwork(uid, playerName, room, adminFlag) {
  myUid = uid;
  myDisplayName = playerName;
  isAdmin = adminFlag;
  setAdminMode(isAdmin);

  network = createNetworkSystem({
    scene,
    uid,
    playerName,
    room,
    eyeHeight: STAND_HEIGHT,
    onLocalPlayerHit: (fromId, fromName, damage) => {
      if (isDead) return;
      playerHp = Math.max(0, playerHp - damage);
      lastDamageTime = performance.now() / 1000;
      flashDamage(damage);
      if (playerHp <= 0) die(fromName);
      updateHud();
    },
    onKillFeed: (killerName, victimName) => {
      pushKillFeed(`${killerName} killed ${victimName}`);
      if (killerName === myDisplayName) network.registerLocalKill();
    },
    onRemoteShot: (id, origin, dir) => {
      drawRemoteTracer(origin, dir);
    },
  });
}

const mpLogin = document.getElementById('mp-login');
const authPanel = document.getElementById('mp-auth-panel');
const roomPanel = document.getElementById('mp-room-panel');
const tabLogin = document.getElementById('mp-tab-login');
const tabSignup = document.getElementById('mp-tab-signup');
const emailInput = document.getElementById('mp-email');
const passwordInput = document.getElementById('mp-password');
const authError = document.getElementById('mp-auth-error');
const authSubmitBtn = document.getElementById('mp-auth-submit');
const mpSoloBtn = document.getElementById('mp-solo-btn');
const welcomeNameEl = document.getElementById('mp-welcome-name');
const displayNameInput = document.getElementById('mp-display-name');
const roomListEl = document.getElementById('mp-room-list');

let authMode = 'login';
tabLogin.addEventListener('click', () => {
  authMode = 'login';
  tabLogin.classList.add('active'); tabSignup.classList.remove('active');
  authSubmitBtn.textContent = 'LOG IN';
});
tabSignup.addEventListener('click', () => {
  authMode = 'signup';
  tabSignup.classList.add('active'); tabLogin.classList.remove('active');
  authSubmitBtn.textContent = 'SIGN UP';
});

let pendingUid = null, pendingIsAdmin = false;

authSubmitBtn.addEventListener('click', async () => {
  authError.textContent = '';
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = 'Please wait...';
  try {
    const { uid, isAdmin: adminFlag } = await loginOrSignUp(emailInput.value.trim(), passwordInput.value, authMode);
    pendingUid = uid;
    pendingIsAdmin = adminFlag;
    welcomeNameEl.textContent = emailInput.value.trim();
    authPanel.style.display = 'none';
    roomPanel.style.display = 'flex';
    await populateRoomList();
  } catch (err) {
    authError.textContent = err.message || 'Something went wrong.';
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode === 'login' ? 'LOG IN' : 'SIGN UP';
  }
});

async function populateRoomList() {
  roomListEl.innerHTML = 'Loading server list...';
  const counts = await fetchRoomCounts(ROOMS).catch(() => ({}));
  roomListEl.innerHTML = '';
  ROOMS.forEach((room) => {
    const btn = document.createElement('button');
    btn.className = 'room-btn';
    const count = counts[room] ?? '?';
    btn.innerHTML = `<span>${room}</span><span>${count} online</span>`;
    btn.addEventListener('click', () => {
      const name = displayNameInput.value.trim() || 'Player';
      startNetwork(pendingUid, name, room, pendingIsAdmin);
      mpLogin.style.display = 'none';
    });
    roomListEl.appendChild(btn);
  });
}

mpSoloBtn.addEventListener('click', () => {
  isAdmin = true; // solo/offline play - no one else around, debug tools are fine
  setAdminMode(isAdmin);
  mpLogin.style.display = 'none';
});

// -----------------------------
// LOADING SCREEN
// -----------------------------
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const TOTAL_ASSETS_TO_LOAD = WEAPON_CONFIGS.length + 1; // weapons + map
let assetsLoaded = 0;

function reportAssetLoaded() {
  assetsLoaded++;
  const pct = Math.min(100, Math.round((assetsLoaded / TOTAL_ASSETS_TO_LOAD) * 100));
  loadingBar.style.width = pct + '%';
  if (assetsLoaded >= TOTAL_ASSETS_TO_LOAD) {
    loadingScreen.style.display = 'none';
    mpLogin.style.display = 'flex';
  }
}

// KICK OFF
setHud(['Loading weapons and map...']);
WEAPON_CONFIGS.forEach((_, i) => loadWeaponAssets(i));
loadMap(MAP_FILE);
animate();
