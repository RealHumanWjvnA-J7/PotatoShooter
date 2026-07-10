MULTIPLAYER SETUP
=================

WHAT WAS ADDED
- server/server.js       -> the relay server (Node.js, run by ONE of you)
- server/package.json    -> its one dependency (ws)
- network.js             -> client networking module, imported by main.js
- main.js / index.html   -> hooked up to send/receive player state, shots, hits

HOW IT WORKS
One of you runs server.js. Everyone (including that person) runs the game
normally via start.sh / index.html, and on load enters the server's address
into the connect overlay. Position, rotation, current weapon, HP, and shoot
events get relayed between everyone every ~50ms. Each client draws the other
players as a simple blue capsule with a name tag above it.

This is intentionally a lightweight relay, not a fully authoritative
server - hit registration is client-reported (see "FAIRNESS NOTE" below).
That's a completely reasonable tradeoff for a friend-group game and keeps
the code simple; tightening it up later is optional.

-----------------------------------------------------------------
STEP 1 - ONE PERSON RUNS THE SERVER
-----------------------------------------------------------------
That person needs Node.js installed (v18+; `node -v` to check).

  cd server
  npm install
  node server.js

You'll see:  [server] listening on ws://0.0.0.0:8643

Leave that running. This works identically whether that person is on
Linux, Windows, or macOS - it's just Node.

-----------------------------------------------------------------
STEP 2 - MAKE THE SERVER REACHABLE OVER THE INTERNET
-----------------------------------------------------------------
Pick ONE of these:

  OPTION A - Port forward (free, but touches your router)
    Forward external port 8643 -> the host machine's local IP, port 8643,
    protocol TCP. Then find your public IP (search "what is my ip") and
    give friends:  ws://YOUR_PUBLIC_IP:8643

  OPTION B - Cloudflare Tunnel or ngrok (free, no router config)
    Easiest for a one-off session. Example with ngrok:
      1. Install ngrok (https://ngrok.com/download)
      2. ngrok tcp 8643
      3. It prints something like: tcp://0.tcp.ngrok.io:14523
      4. Give friends: ws://0.tcp.ngrok.io:14523
    (Cloudflare Tunnel's `cloudflared tcp` works the same way if you'd
    rather not use ngrok.)

  OPTION C - Everyone's on the same LAN/hotel wifi/VPN (e.g. Tailscale)
    Just use the host's local or Tailscale IP directly:
    ws://192.168.x.x:8643  or  ws://100.x.x.x:8643
    No port forwarding needed for this one.

-----------------------------------------------------------------
STEP 3 - EVERYONE LAUNCHES THE GAME
-----------------------------------------------------------------
  ./start.sh
    (or python3 -m http.server 8642, then open http://localhost:8642)

On the connect screen:
  Name:   whatever you want shown above your character
  Server: ws://<address-from-step-2>:8643
          (leave blank to just play solo/offline, unchanged from before)

Click PLAY. You should see other connected players' blue capsules moving
around, and see a tracer line when they shoot.

-----------------------------------------------------------------
FAIRNESS NOTE
-----------------------------------------------------------------
Hit damage is currently reported by whoever's shooting (client-side hit
detection, relayed to the target). Fine for a casual match with friends.
If you ever want it harder to cheat, the next step would be moving hit
detection into server.js itself (it already has everyone's positions each
tick, so it could raycast server-side instead of trusting the client) -
happy to build that out if/when you want it.

-----------------------------------------------------------------
KNOWN LIMITATIONS / NEXT STEPS (not blocking, just FYI)
-----------------------------------------------------------------
- Remote players aren't currently added to `collidables`, so bullets pass
  through their capsule visually correct hits aren't auto-detected against
  them yet - hookable via network.getRemotePlayers() + a raycast against
  each root's children in raycastHit().
- No respawn/death flow - hp can go to 0 with no game-over handling yet.
- No lag compensation/rewind; interpolation just smooths what's already
  a pretty small friend-group latency budget.
