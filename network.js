import * as THREE from 'three';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getDatabase, ref, set, update, remove, onValue, onDisconnect,
  push, onChildAdded, serverTimestamp, get,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';

// -----------------------------
// MULTIPLAYER NETWORK MODULE (Firebase Realtime Database backend)
// -----------------------------
// This replaces the old WebSocket relay (server.js) entirely. Firebase's
// free "Spark" tier hosts the realtime sync for you - no server to run,
// no ngrok, no port forwarding. Every player's browser talks directly to
// Firebase, and Firebase fans the updates out to everyone else.
//
// SETUP (one-time, see FIREBASE_SETUP.txt for full steps):
//   1. Create a free Firebase project at https://console.firebase.google.com
//   2. Enable "Realtime Database" (not Firestore) in test/locked mode
//   3. Paste your project's config into FIREBASE_CONFIG below
//   4. Set the database rules from FIREBASE_SETUP.txt
//
// NOTE: it's normal and expected for this config object to be public/
// hardcoded in client-side code - that's how Firebase web apps always
// work. Access control is enforced by the Database Rules you set in the
// Firebase console, not by hiding these values.
// -----------------------------

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBPTvko5VgB1Tlo81e_ez_1mvoRhBypjWs",
  authDomain: "potatoshooter-19fd7.firebaseapp.com",
  databaseURL: "https://potatoshooter-19fd7-default-rtdb.firebaseio.com",
  projectId: "potatoshooter-19fd7",
};

const STATE_SEND_HZ = 15;
const INTERP_SPEED = 12;
const STALE_PLAYER_MS = 10000; // if a player's data hasn't updated in this long, drop them locally

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {string} deps.playerName
 * @param {(fromId: string, damage: number) => void} deps.onLocalPlayerHit
 * @param {(id: string, origin: number[], dir: number[], weaponIndex: number) => void} deps.onRemoteShot
 * @param {number} [deps.eyeHeight=1.8]
 */
export function createNetworkSystem(deps) {
  const { scene, playerName, onLocalPlayerHit, onRemoteShot, eyeHeight = 1.8 } = deps;

  const app = initializeApp(FIREBASE_CONFIG);
  const db = getDatabase(app);

  const myId = push(ref(db, 'players')).key; // generate a unique id up front
  const myPlayerRef = ref(db, `players/${myId}`);
  const eventsRef = ref(db, 'events');

  let connected = false;
  let latestLocalState = null;
  const seenEventKeys = new Set();

  /** @type {Map<string, { root, nameSprite, targetPos, targetRotY, hp, name, lastUpdate }>} */
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
    return { root, nameSprite };
  }

  function addOrUpdateRemotePlayer(id, data) {
    if (id === myId || !data) return;
    const pos = data.pos || [50, eyeHeight, 0];
    const feetY = pos[1] - eyeHeight;

    if (!remotePlayers.has(id)) {
      const { root, nameSprite } = makeRemotePlayerMesh(data.name || 'Player', id);
      root.position.set(pos[0], feetY, pos[2]);
      remotePlayers.set(id, {
        root, nameSprite,
        targetPos: new THREE.Vector3(pos[0], feetY, pos[2]),
        targetRotY: data.rotY || 0,
        hp: data.hp, name: data.name,
        lastUpdate: Date.now(),
      });
      console.log(`[net] spawned remote player "${data.name}" (${id})`);
    } else {
      const rp = remotePlayers.get(id);
      rp.targetPos.set(pos[0], feetY, pos[2]);
      rp.targetRotY = data.rotY || 0;
      rp.hp = data.hp;
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

  async function connect() {
    console.log('[net] connecting to Firebase...');

    // Announce ourselves, and make sure our node auto-deletes if we
    // close the tab, lose power, whatever - no server-side timeout
    // logic needed, Firebase handles this natively.
    await set(myPlayerRef, {
      name: playerName,
      pos: [50, eyeHeight, 0],
      rotY: 0,
      weaponIndex: 0,
      hp: 150,
      updatedAt: serverTimestamp(),
    });
    onDisconnect(myPlayerRef).remove();

    connected = true;
    console.log(`[net] connected as ${myId}`);

    // Listen for the full roster of players
    onValue(ref(db, 'players'), (snapshot) => {
      const all = snapshot.val() || {};
      const seen = new Set();
      for (const [id, data] of Object.entries(all)) {
        if (id === myId) continue;
        seen.add(id);
        addOrUpdateRemotePlayer(id, data);
      }
      for (const id of remotePlayers.keys()) {
        if (!seen.has(id)) removeRemotePlayer(id);
      }
    });

    // Listen for shoot/hit events (a shared append-only list, pruned as we go)
    onChildAdded(eventsRef, (snapshot) => {
      const key = snapshot.key;
      const evt = snapshot.val();
      if (!evt || seenEventKeys.has(key)) return;
      seenEventKeys.add(key);

      if (evt.type === 'shoot' && evt.from !== myId) {
        if (onRemoteShot) onRemoteShot(evt.from, evt.origin, evt.dir, evt.weaponIndex);
      } else if (evt.type === 'hit' && evt.targetId === myId) {
        if (onLocalPlayerHit) onLocalPlayerHit(evt.from, evt.damage);
      }

      // Clean up old events lazily so the list doesn't grow forever.
      // (Simple approach: remove it once we've processed it. Fine for a
      // small friend group - if you ever need replay/history, don't do this.)
      remove(ref(db, `events/${key}`)).catch(() => {});
    });
  }

  connect();

  setInterval(() => {
    if (!connected || !latestLocalState) return;
    update(myPlayerRef, { ...latestLocalState, updatedAt: serverTimestamp() }).catch(() => {});
  }, 1000 / STATE_SEND_HZ);

  // Safety net: prune remote players we haven't heard from in a while,
  // in case an onDisconnect didn't fire cleanly (e.g. hard crash).
  setInterval(() => {
    const now = Date.now();
    for (const [id, rp] of remotePlayers) {
      if (now - rp.lastUpdate > STALE_PLAYER_MS) removeRemotePlayer(id);
    }
  }, 3000);

  return {
    update(delta, playerPos, cameraRotY, weaponIndex, hp) {
      latestLocalState = {
        pos: [playerPos.x, playerPos.y, playerPos.z],
        rotY: cameraRotY,
        weaponIndex,
        hp,
      };

      const t = Math.min(1, delta * INTERP_SPEED);
      for (const rp of remotePlayers.values()) {
        rp.root.position.lerp(rp.targetPos, t);
        rp.root.rotation.y = THREE.MathUtils.lerp(rp.root.rotation.y, rp.targetRotY, t);
      }
    },

    sendShoot(originVec3, dirVec3, weaponIndex) {
      if (!connected) return;
      push(eventsRef, {
        type: 'shoot',
        from: myId,
        origin: [originVec3.x, originVec3.y, originVec3.z],
        dir: [dirVec3.x, dirVec3.y, dirVec3.z],
        weaponIndex,
      }).catch(() => {});
    },

    sendHit(targetId, damage) {
      if (!connected) return;
      push(eventsRef, { type: 'hit', from: myId, targetId, damage }).catch(() => {});
    },

    getRemotePlayers() { return remotePlayers; },
    getRemotePlayerMeshes() { return [...remotePlayers.values()].map(rp => rp.root); },
    isConnected() { return connected; },
    getMyId() { return myId; },
  };
}
