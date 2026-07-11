import * as THREE from 'three';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  getDatabase, ref, set, update, remove, onValue, onDisconnect,
  push, onChildAdded, serverTimestamp, get,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';

// -----------------------------
// MULTIPLAYER NETWORK MODULE (Firebase Auth + Realtime Database backend)
// -----------------------------
// Free Firebase Spark tier. No server to run. See FIREBASE_GITHUB_SETUP.txt
// for one-time console setup (enabling Auth, Realtime Database, rules).
//
// NOTE: it's normal for this config object to be public in client code -
// access control is enforced by Database Rules, not by hiding these values.
// -----------------------------

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBPTvko5VgB1Tlo81e_ez_1mvoRhBypjWs",
  authDomain: "potatoshooter-19fd7.firebaseapp.com",
  databaseURL: "https://potatoshooter-19fd7-default-rtdb.firebaseio.com",
  projectId: "potatoshooter-19fd7",
};

const STATE_SEND_HZ = 15;
const INTERP_SPEED = 12;
const STALE_PLAYER_MS = 10000;

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getDatabase(app);

/**
 * Creates or logs into an account. Returns { uid, isAdmin } on success,
 * throws with a readable .message on failure (bad password, banned, etc).
 */
export async function loginOrSignUp(email, password, mode /* 'login' | 'signup' */) {
  let cred;
  if (mode === 'signup') {
    cred = await createUserWithEmailAndPassword(auth, email, password);
  } else {
    cred = await signInWithEmailAndPassword(auth, email, password);
  }
  const uid = cred.user.uid;

  const bannedSnap = await get(ref(db, `banned/${uid}`));
  if (bannedSnap.exists()) {
    throw new Error('This account has been suspended.');
  }

  const adminSnap = await get(ref(db, `admins/${uid}`));
  const isAdmin = adminSnap.exists() && adminSnap.val() === true;
  return { uid, isAdmin };
}

/** Reads player counts for every room, for the room-select screen. */
export async function fetchRoomCounts(rooms) {
  const counts = {};
  await Promise.all(rooms.map(async (room) => {
    const snap = await get(ref(db, `players/${room}`));
    counts[room] = snap.exists() ? Object.keys(snap.val()).length : 0;
  }));
  return counts;
}

/** Admin-only: ban a uid. Enforced server-side by database rules - will
 *  fail silently (permission denied) if the caller isn't a real admin. */
export function banPlayer(uid) {
  return set(ref(db, `banned/${uid}`), true);
}

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {string} deps.uid
 * @param {string} deps.playerName
 * @param {string} deps.room
 * @param {(fromId: string, fromName: string, damage: number) => void} deps.onLocalPlayerHit
 * @param {(killerName: string, victimName: string) => void} deps.onKillFeed
 * @param {(id: string, origin: number[], dir: number[], weaponIndex: number) => void} deps.onRemoteShot
 * @param {number} [deps.eyeHeight=1.8]
 */
export function createNetworkSystem(deps) {
  const { scene, uid, playerName, room, onLocalPlayerHit, onKillFeed, onRemoteShot, eyeHeight = 1.8 } = deps;

  const myPlayerRef = ref(db, `players/${room}/${uid}`);
  const eventsRef = ref(db, `events/${room}`);

  let connected = false;
  let latestLocalState = null;
  const seenEventKeys = new Set();

  /** @type {Map<string, { root, nameSprite, body, targetPos, targetRotY, targetCrouch, targetLean, hp, name, kills, deaths, lastUpdate }>} */
  const remotePlayers = new Map();

  function makeNameSprite(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = 2.2;
    return sprite;
  }

  function makeRemotePlayerMesh(name, id) {
    const root = new THREE.Group();

    const bodyGeo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3388ff,
      roughness: 0.6,
      side: THREE.DoubleSide,
      emissive: 0x1144aa,
      emissiveIntensity: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = eyeHeight / 2;
    body.castShadow = true;
    body.userData.isRemotePlayer = true;
    body.userData.remotePlayerId = id;
    root.add(body);

    const nameSprite = makeNameSprite(name);
    root.add(nameSprite);

    scene.add(root);
    return { root, nameSprite, body };
  }

  function addOrUpdateRemotePlayer(id, data) {
    if (id === uid || !data) return;
    const pos = data.pos || [50, eyeHeight, 0];
    const feetY = pos[1] - eyeHeight;

    if (!remotePlayers.has(id)) {
      const { root, nameSprite, body } = makeRemotePlayerMesh(data.name || 'Player', id);
      root.position.set(pos[0], feetY, pos[2]);
      remotePlayers.set(id, {
        root, nameSprite, body,
        targetPos: new THREE.Vector3(pos[0], feetY, pos[2]),
        targetRotY: data.rotY || 0,
        targetCrouch: data.crouch ? 1 : 0,
        targetLean: data.lean || 0,
        hp: data.hp, name: data.name,
        kills: data.kills || 0, deaths: data.deaths || 0,
        lastUpdate: Date.now(),
      });
      console.log(`[net] spawned remote player "${data.name}" (${id})`);
    } else {
      const rp = remotePlayers.get(id);
      rp.targetPos.set(pos[0], feetY, pos[2]);
      rp.targetRotY = data.rotY || 0;
      rp.targetCrouch = data.crouch ? 1 : 0;
      rp.targetLean = data.lean || 0;
      rp.hp = data.hp;
      rp.kills = data.kills || 0;
      rp.deaths = data.deaths || 0;
      rp.lastUpdate = Date.now();
    }
  }

  function removeRemotePlayer(id) {
    const rp = remotePlayers.get(id);
    if (!rp) return;
    console.log(`[net] removed remote player "${rp.name}" (${id})`);
    scene.remove(rp.root);
    rp.root.traverse(o => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
    });
    remotePlayers.delete(id);
  }

  let myKills = 0, myDeaths = 0;

  async function connect() {
    console.log(`[net] connecting to room "${room}" as ${playerName} (${uid})...`);

    await set(myPlayerRef, {
      name: playerName,
      pos: [50, eyeHeight, 0],
      rotY: 0, crouch: false, lean: 0,
      weaponIndex: 0,
      hp: 150,
      kills: 0, deaths: 0,
      updatedAt: serverTimestamp(),
    });
    onDisconnect(myPlayerRef).remove();

    connected = true;
    console.log(`[net] connected`);

    onValue(ref(db, `players/${room}`), (snapshot) => {
      const all = snapshot.val() || {};
      const seen = new Set();
      for (const [id, data] of Object.entries(all)) {
        if (id === uid) continue;
        seen.add(id);
        addOrUpdateRemotePlayer(id, data);
      }
      for (const id of remotePlayers.keys()) {
        if (!seen.has(id)) removeRemotePlayer(id);
      }
    });

    onChildAdded(eventsRef, (snapshot) => {
      const key = snapshot.key;
      const evt = snapshot.val();
      if (!evt || seenEventKeys.has(key)) return;
      seenEventKeys.add(key);

      if (evt.type === 'shoot' && evt.from !== uid) {
        if (onRemoteShot) onRemoteShot(evt.from, evt.origin, evt.dir, evt.weaponIndex);
      } else if (evt.type === 'hit' && evt.targetId === uid) {
        if (onLocalPlayerHit) onLocalPlayerHit(evt.from, evt.fromName, evt.damage);
      } else if (evt.type === 'death') {
        if (onKillFeed) onKillFeed(evt.killerName, evt.victimName);
      }

      remove(ref(db, `events/${room}/${key}`)).catch(() => {});
    });
  }

  connect();

  setInterval(() => {
    if (!connected || !latestLocalState) return;
    update(myPlayerRef, { ...latestLocalState, updatedAt: serverTimestamp() }).catch(() => {});
  }, 1000 / STATE_SEND_HZ);

  setInterval(() => {
    const now = Date.now();
    for (const [id, rp] of remotePlayers) {
      if (now - rp.lastUpdate > STALE_PLAYER_MS) removeRemotePlayer(id);
    }
  }, 3000);

  return {
    update(delta, playerPos, cameraRotY, weaponIndex, hp, crouching, leanAmt) {
      latestLocalState = {
        pos: [playerPos.x, playerPos.y, playerPos.z],
        rotY: cameraRotY,
        crouch: !!crouching,
        lean: leanAmt || 0,
        weaponIndex,
        hp,
        kills: myKills,
        deaths: myDeaths,
      };

      const t = Math.min(1, delta * INTERP_SPEED);
      for (const rp of remotePlayers.values()) {
        rp.root.position.lerp(rp.targetPos, t);
        rp.root.rotation.y = THREE.MathUtils.lerp(rp.root.rotation.y, rp.targetRotY, t);
        rp.root.rotation.z = THREE.MathUtils.lerp(rp.root.rotation.z, rp.targetLean, t);

        const targetScaleY = rp.targetCrouch ? 0.72 : 1.0;
        rp.body.scale.y = THREE.MathUtils.lerp(rp.body.scale.y, targetScaleY, t);
        const heightDrop = (1.0 - rp.body.scale.y) * eyeHeight * 0.5;
        rp.nameSprite.position.y = 2.2 - heightDrop;
      }
    },

    sendShoot(originVec3, dirVec3, weaponIndex) {
      if (!connected) return;
      push(eventsRef, {
        type: 'shoot',
        from: uid,
        origin: [originVec3.x, originVec3.y, originVec3.z],
        dir: [dirVec3.x, dirVec3.y, dirVec3.z],
        weaponIndex,
      }).catch(() => {});
    },

    sendHit(targetId, damage) {
      if (!connected) return;
      push(eventsRef, { type: 'hit', from: uid, fromName: playerName, targetId, damage }).catch(() => {});
    },

    /** Call when the LOCAL player dies, naming who killed them (or null if environmental/unknown). */
    sendDeath(killerName) {
      myDeaths++;
      if (!connected) return;
      push(eventsRef, { type: 'death', killerName: killerName || 'the environment', victimName: playerName }).catch(() => {});
    },

    /** Call when the local player's shot kills someone else, for the local kill counter. */
    registerLocalKill() {
      myKills++;
    },

    getRemotePlayers() { return remotePlayers; },
    getRemotePlayerMeshes() { return [...remotePlayers.values()].map(rp => rp.root); },
    getScoreboard() {
      const rows = [...remotePlayers.entries()].map(([id, rp]) => ({ uid: id, name: rp.name, kills: rp.kills, deaths: rp.deaths }));
      rows.push({ uid: null, name: playerName + ' (you)', kills: myKills, deaths: myDeaths });
      return rows.sort((a, b) => b.kills - a.kills);
    },
    isConnected() { return connected; },
    getMyId() { return uid; },
  };
}
