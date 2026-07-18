MULTIPLAYER SETUP
=================

WHAT'S HERE
- network.js  -> client networking module (Firebase Auth + Realtime
                 Database), imported by main.js
- main.js / index.html -> login/signup screen, room select, HUD,
                 connection-status banner, all wired to network.js
- config.js   -> ROOMS array (5 hardcoded rooms/servers)

There is NO server.js / relay server to run anymore - that was an
earlier version of this project. Multiplayer now runs entirely on
Firebase (free Spark tier): Firebase Auth for accounts, Realtime
Database for player state, shots, hits, kill feed, bans, and admin
flags. See ACCOUNTS_ADMIN_SETUP.txt for the one-time Firebase console
setup (enabling email/password sign-in, database rules, making
yourself admin).

HOW IT WORKS
Everyone runs the game via start.sh (or a local http.server) and hits
the same deployed Firebase backend - no port forwarding, ngrok, or
router config needed, since Firebase handles all of that. On load,
players sign up / log in (or "PLAY SOLO" for offline), pick one of the
5 rooms, and enter. Each room is a fully separate match; player state,
kill feed, and events don't cross between rooms. Position, rotation,
current weapon, HP, and shoot events sync through the Realtime
Database roughly 15x/second per player. Other players render as blue
capsules with a name tag and take real headshot/body hit detection
(client-reported - see FAIRNESS NOTE).

-----------------------------------------------------------------
RUNNING IT LOCALLY
-----------------------------------------------------------------
  ./start.sh
    (or python3 -m http.server 8642, then open http://localhost:8642)

That's it - no separate server process. The deployed GitHub Pages
version works identically, since it's just static files talking to
Firebase.

-----------------------------------------------------------------
FAIRNESS NOTE
-----------------------------------------------------------------
Hit damage is currently reported by whoever's shooting (client-side
raycast + hit detection, written to the Realtime Database, relayed to
the target). Fine for a casual match with friends. Firebase database
rules now put hard bounds on the values a client can write (see
ACCOUNTS_ADMIN_SETUP.txt) - this stops corrupted/absurd writes (e.g.
negative HP, a 999999-damage event) but does NOT verify that a raycast
genuinely landed. A modified client can still claim hits that didn't
happen. Real fix would be moving hit detection server-side (Firebase
Cloud Functions on a paid plan, or a custom authoritative relay
server) - that's a real project on its own, not a quick change.

-----------------------------------------------------------------
KNOWN LIMITATIONS / NEXT STEPS (not blocking, just FYI)
-----------------------------------------------------------------
- Hit detection is still client-reported (see FAIRNESS NOTE above).
- No lag compensation/rewind; interpolation just smooths what's
  already a pretty small friend-group latency budget.
- If the connection drops mid-match, a red "Connection lost -
  reconnecting..." banner now shows at the top of the screen (driven
  by Firebase's `.info/connected` state) instead of the game silently
  freezing/desyncing with no indication anything's wrong. It clears
  automatically once Firebase reconnects.
- Firebase's free Spark tier has daily connection/bandwidth limits -
  fine for a friend group, but worth knowing about if this ever gets
  a larger audience.
