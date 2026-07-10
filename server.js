// Multiplayer relay server for the GLTF FPS demo.
// Pure Node.js + the 'ws' package - no native deps, runs identically on
// Linux/Windows/Mac. Your friends connect over the internet via WebSocket,
// so this works across different OSes and networks, not just LAN.
//
// RUN:
//   npm install
//   node server.js
// (defaults to port 8643 - override with PORT env var)

import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

const PORT = process.env.PORT || 8643;
const SNAPSHOT_HZ = 20; // how often we broadcast position snapshots
const IDLE_TIMEOUT_MS = 30000; // drop clients that stop sending state

const wss = new WebSocketServer({ port: PORT });
console.log(`[server] listening on ws://0.0.0.0:${PORT}`);

/** @type {Map<string, {ws: any, name: string, pos: number[], rotY: number, weaponIndex: number, hp: number, lastSeen: number}>} */
const players = new Map();

function broadcast(data, exceptId = null) {
  const msg = JSON.stringify(data);
  for (const [id, p] of players) {
    if (id === exceptId) continue;
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(msg);
  }
}

wss.on('connection', (ws) => {
  const id = randomUUID();
  let joined = false;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join': {
        // Small random spawn offset so multiple players don't stack on
        // the exact same point (which made remote players invisible -
        // you were literally standing inside their mesh).
        const spawnPos = [50 + (Math.random() - 0.5) * 6, 2.5, (Math.random() - 0.5) * 6];
        players.set(id, {
          ws,
          name: (msg.name || 'Player').slice(0, 24),
          pos: spawnPos,
          rotY: 0,
          weaponIndex: 0,
          hp: 150,
          lastSeen: Date.now(),
        });
        joined = true;

        // Tell the new player their id + the current roster
        ws.send(JSON.stringify({
          type: 'welcome',
          id,
          players: [...players.entries()]
            .filter(([pid]) => pid !== id)
            .map(([pid, p]) => ({ id: pid, name: p.name, pos: p.pos, rotY: p.rotY, weaponIndex: p.weaponIndex, hp: p.hp })),
        }));

        // Tell everyone else someone joined
        broadcast({ type: 'playerJoined', id, name: players.get(id).name }, id);
        console.log(`[server] ${players.get(id).name} joined (${id}) - ${players.size} online`);
        break;
      }

      case 'state': {
        const p = players.get(id);
        if (!p) return;
        p.pos = msg.pos;
        p.rotY = msg.rotY;
        p.weaponIndex = msg.weaponIndex;
        p.hp = msg.hp;
        p.lastSeen = Date.now();
        break;
      }

      case 'shoot': {
        if (!players.has(id)) return;
        broadcast({ type: 'shoot', id, origin: msg.origin, dir: msg.dir, weaponIndex: msg.weaponIndex }, id);
        break;
      }

      case 'hit': {
        // msg.targetId is who got hit, msg.damage how much - relayed so
        // the target's own client applies the damage (keeps it simple,
        // not fully cheat-proof, but fine for a friend group).
        if (!players.has(id)) return;
        broadcast({ type: 'hit', from: id, targetId: msg.targetId, damage: msg.damage });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (joined) {
      players.delete(id);
      broadcast({ type: 'playerLeft', id });
      console.log(`[server] ${id} left - ${players.size} online`);
    }
  });

  ws.on('error', () => {});
});

// Periodic snapshot broadcast (positions of everyone, to everyone)
setInterval(() => {
  if (players.size === 0) return;
  const snapshot = [...players.entries()].map(([id, p]) => ({
    id, name: p.name, pos: p.pos, rotY: p.rotY, weaponIndex: p.weaponIndex, hp: p.hp,
  }));
  broadcast({ type: 'snapshot', players: snapshot });
}, 1000 / SNAPSHOT_HZ);

// Drop players who've gone quiet (closed tab without a clean close, etc.)
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of players) {
    if (now - p.lastSeen > IDLE_TIMEOUT_MS) {
      p.ws.terminate();
      players.delete(id);
      broadcast({ type: 'playerLeft', id });
      console.log(`[server] ${id} timed out - ${players.size} online`);
    }
  }
}, 5000);
