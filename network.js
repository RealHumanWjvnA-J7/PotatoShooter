import * as THREE from 'three';

// -----------------------------
// MULTIPLAYER NETWORK MODULE
// Talks to server.js over WebSocket. Handles the connection, sends your
// local state at a steady rate, and owns the "remote player" meshes so
// main.js doesn't have to know anything about sockets - it just calls
// the handful of functions returned by createNetworkSystem().
// -----------------------------

const STATE_SEND_HZ = 20;
const INTERP_SPEED = 12; // higher = snappier remote-player movement, lower = smoother but laggier

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {string} deps.serverUrl - e.g. "ws://1.2.3.4:8643" or "wss://yourdomain.com"
 * @param {string} deps.playerName
 * @param {(fromId: string, damage: number) => void} deps.onLocalPlayerHit - called when a 'hit' event targets us
 * @param {(id: string, origin: number[], dir: number[], weaponIndex: number) => void} deps.onRemoteShot - called to play a tracer/visual for someone else's shot
 * @param {number} [deps.eyeHeight=1.8] - your STAND_HEIGHT constant; used to convert the eye-level position we send over the network back into a feet-on-ground position for the remote player mesh
 */
export function createNetworkSystem(deps) {
  const { scene, serverUrl, playerName, onLocalPlayerHit, onRemoteShot, eyeHeight = 1.8 } = deps;

  let ws = null;
  let myId = null;
  let connected = false;
  let latestLocalState = null; // { pos, rotY, weaponIndex, hp } - updated every frame, sent on a real timer

  /** @type {Map<string, { root: THREE.Group, nameSprite: THREE.Sprite, targetPos: THREE.Vector3, targetRotY: number, hp: number, name: string }>} */
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
      side: THREE.DoubleSide, // visible even if the local camera ends up inside it
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

  function addRemotePlayer(id, name, pos, rotY, hp) {
    if (remotePlayers.has(id)) return;
    const { root, nameSprite } = makeRemotePlayerMesh(name, id);
    root.position.set(pos[0], pos[1] - eyeHeight, pos[2]);
    remotePlayers.set(id, {
      root, nameSprite,
      targetPos: new THREE.Vector3(pos[0], pos[1] - eyeHeight, pos[2]),
      targetRotY: rotY,
      hp, name,
    });
    console.log(`[net] spawned remote player "${name}" (${id}) at`, pos);
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

  function applySnapshot(list) {
    const seen = new Set();
    for (const p of list) {
      if (p.id === myId) continue;
      seen.add(p.id);
      if (!remotePlayers.has(p.id)) {
        addRemotePlayer(p.id, p.name, p.pos, p.rotY, p.hp);
      } else {
        const rp = remotePlayers.get(p.id);
        rp.targetPos.set(p.pos[0], p.pos[1] - eyeHeight, p.pos[2]);
        rp.targetRotY = p.rotY;
        rp.hp = p.hp;
      }
    }
    // Clean up anyone in our local map who dropped out of the last snapshot
    for (const id of remotePlayers.keys()) {
      if (!seen.has(id)) removeRemotePlayer(id);
    }
  }

  function connect() {
    console.log(`[net] connecting to ${serverUrl} ...`);
    ws = new WebSocket(serverUrl);

    ws.addEventListener('open', () => {
      console.log('[net] socket open, joining as', playerName);
      ws.send(JSON.stringify({ type: 'join', name: playerName }));
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      switch (msg.type) {
        case 'welcome':
          myId = msg.id;
          connected = true;
          for (const p of msg.players) addRemotePlayer(p.id, p.name, p.pos, p.rotY, p.hp);
          console.log(`[net] connected as ${myId}`);
          break;
        case 'snapshot':
          applySnapshot(msg.players);
          break;
        case 'playerJoined':
          console.log(`[net] ${msg.name} joined`);
          break;
        case 'playerLeft':
          removeRemotePlayer(msg.id);
          break;
        case 'shoot':
          if (onRemoteShot) onRemoteShot(msg.id, msg.origin, msg.dir, msg.weaponIndex);
          break;
        case 'hit':
          if (msg.targetId === myId && onLocalPlayerHit) onLocalPlayerHit(msg.from, msg.damage);
          break;
      }
    });

    ws.addEventListener('close', () => {
      connected = false;
      console.log('[net] disconnected, retrying in 2s...');
      setTimeout(connect, 2000);
    });

    ws.addEventListener('error', (e) => { console.error('[net] socket error', e); });
  }

  connect();

  // IMPORTANT: this runs on a real timer, not requestAnimationFrame.
  // Backgrounded browser tabs throttle rAF (sometimes to ~1fps or less),
  // which used to make network sends stop and get the client kicked by
  // the server's idle timeout. setInterval is throttled far less
  // aggressively, so state keeps flowing even if the tab loses focus.
  setInterval(() => {
    if (!connected || !latestLocalState) return;
    ws.send(JSON.stringify({ type: 'state', ...latestLocalState }));
  }, 1000 / STATE_SEND_HZ);

  return {
    /** Call once per frame from animate(). Records local state (sent on its own timer) and interpolates remote players. */
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

    /** Call when the local player fires, so others see it. */
    sendShoot(originVec3, dirVec3, weaponIndex) {
      if (!connected) return;
      ws.send(JSON.stringify({
        type: 'shoot',
        origin: [originVec3.x, originVec3.y, originVec3.z],
        dir: [dirVec3.x, dirVec3.y, dirVec3.z],
        weaponIndex,
      }));
    },

    /** Call when the local player's raycast hits a known remote player's hitbox. */
    sendHit(targetId, damage) {
      if (!connected) return;
      ws.send(JSON.stringify({ type: 'hit', targetId, damage }));
    },

    /** Returns [ [id, {root, targetPos, ...}], ... ] so main.js can raycast against remote hitboxes if desired. */
    getRemotePlayers() { return remotePlayers; },

    /** Flat array of the actual mesh objects to hand to raycaster.intersectObjects(). */
    getRemotePlayerMeshes() {
      return [...remotePlayers.values()].map(rp => rp.root);
    },

    isConnected() { return connected; },
    getMyId() { return myId; },
  };
}
