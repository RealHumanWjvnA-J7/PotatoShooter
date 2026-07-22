import {
  ref, onValue, update, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';
import { db } from './network.js';
import {
  MODES, MODE_LIST, MAPS, INTERMISSION_DURATION_MS, VOTE_PHASE_DURATION_MS,
  MODE_VOTE_OPTIONS_COUNT, MAP_VOTE_OPTIONS_COUNT,
} from './config.js';

// -----------------------------
// MATCH STATE MACHINE (Phase 2 scaffold)
// -----------------------------
// Phases, in order: 'playing' -> 'intermission' (post-match summary) ->
// 'voting_mode' -> 'voting_map' -> 'playing' (new round), forever.
//
// Entirely client-driven, same pattern as network.js's scheduled reset:
// every connected client periodically checks whether the current phase is
// overdue to end, and tries to advance it via a Firebase transaction.
// Transactions are atomic, so if several clients' checks fire close
// together only one of them actually succeeds - everyone (including the
// "winner") then sees the change via the normal onValue listener and
// reacts identically, so there's no special-cased "host" client anywhere.
//
// Win condition here is a placeholder: first to a mode's scoreCap (using a
// generic "roundKills" counter), or whoever's ahead when timeLimitSec runs
// out. Real per-mode scoring (team score, weapon-tier, capture time,
// infection state) replaces this in Phase 3 without touching the phase
// machine itself.
// -----------------------------

const CHECK_INTERVAL_MS = 1500;

function sampleRandom(arr, count) {
  const pool = [...arr];
  const out = [];
  while (pool.length > 0 && out.length < count) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// Counts votes, restricted to whatever options are actually valid for this
// round (ignores stale votes for options that aren't currently offered).
// Ties broken randomly. No votes cast at all -> pick randomly among options,
// so a round never gets stuck because nobody clicked anything in time.
function tallyVotes(votes, options) {
  if (!options || options.length === 0) return null;
  const counts = {};
  options.forEach((o) => { counts[o] = 0; });
  Object.values(votes || {}).forEach((v) => { if (counts[v] !== undefined) counts[v]++; });
  let best = [];
  let bestCount = -1;
  options.forEach((o) => {
    if (counts[o] > bestCount) { bestCount = counts[o]; best = [o]; }
    else if (counts[o] === bestCount) best.push(o);
  });
  return best[Math.floor(Math.random() * best.length)];
}

/**
 * @param {object} deps
 * @param {string} deps.room
 * @param {string} deps.uid
 * @param {(state: object|null) => void} [deps.onStateChange] - fired on every matchState change, including the initial read
 */
export function createMatchStateSystem(deps) {
  const { room, uid, onStateChange } = deps;

  const stateRef = ref(db, `matchState/${room}`);
  const playersRef = ref(db, `players/${room}`);

  let latestState = null;
  let latestPlayers = {};
  let localRoundKills = 0;
  let lastSeenRoundStart = null;

  // Claim-init: if this room has no match state yet (first player ever, or
  // right after the 8-hour reset wiped everyone out), one client sets up
  // the very first round. Transaction-guarded so only one client's attempt
  // actually takes effect even if several join at the same moment.
  function ensureInitialized() {
    runTransaction(stateRef, (current) => {
      if (current) return; // already exists - abort, no-op
      const firstMode = MODE_LIST[Math.floor(Math.random() * MODE_LIST.length)].id;
      const firstMap = MAPS[Math.floor(Math.random() * MAPS.length)].id;
      return {
        phase: 'playing',
        currentMode: firstMode,
        currentMap: firstMap,
        roundStartedAt: Date.now(),
        phaseEndsAt: null,
        endReason: null,
      };
    }).catch(() => {});
  }

  function tryEndRound(reason) {
    runTransaction(stateRef, (current) => {
      if (!current || current.phase !== 'playing') return; // someone already ended it, or we're not even in a round
      return {
        ...current,
        phase: 'intermission',
        phaseEndsAt: Date.now() + INTERMISSION_DURATION_MS,
        endReason: reason,
      };
    }).catch(() => {});
  }

  function tryAdvancePhase() {
    runTransaction(stateRef, (current) => {
      if (!current) return;
      const now = Date.now();
      if (!current.phaseEndsAt || now < current.phaseEndsAt) return; // not overdue - another client beat us to it, or clock skew

      if (current.phase === 'intermission') {
        return {
          ...current,
          phase: 'voting_mode',
          phaseEndsAt: now + VOTE_PHASE_DURATION_MS,
          modeVoteOptions: sampleRandom(Object.keys(MODES), Math.min(MODE_VOTE_OPTIONS_COUNT, MODE_LIST.length)),
          modeVotes: {},
        };
      }
      if (current.phase === 'voting_mode') {
        const winner = tallyVotes(current.modeVotes, current.modeVoteOptions) || current.currentMode;
        return {
          ...current,
          phase: 'voting_map',
          currentMode: winner,
          phaseEndsAt: now + VOTE_PHASE_DURATION_MS,
          mapVoteOptions: sampleRandom(MAPS.map((m) => m.id), Math.min(MAP_VOTE_OPTIONS_COUNT, MAPS.length)),
          mapVotes: {},
        };
      }
      if (current.phase === 'voting_map') {
        const winner = tallyVotes(current.mapVotes, current.mapVoteOptions) || current.currentMap;
        return {
          ...current,
          phase: 'playing',
          currentMap: winner,
          roundStartedAt: now,
          phaseEndsAt: null,
          endReason: null,
        };
      }
      return; // unrecognized phase - abort rather than risk corrupting state
    }).catch(() => {});
  }

  function checkAndAdvance() {
    if (!latestState) return;

    if (latestState.phase === 'playing') {
      const mode = MODES[latestState.currentMode] || MODE_LIST[0];
      const elapsedMs = Date.now() - (latestState.roundStartedAt || Date.now());
      const timeUp = !!mode.timeLimitSec && elapsedMs >= mode.timeLimitSec * 1000;
      const capHit = !!mode.scoreCap
        && Object.values(latestPlayers).some((p) => (p.roundKills || 0) >= mode.scoreCap);
      if (capHit) tryEndRound('score_cap');
      else if (timeUp) tryEndRound('time_limit');
    } else if (latestState.phaseEndsAt && Date.now() >= latestState.phaseEndsAt) {
      tryAdvancePhase();
    }
  }

  onValue(stateRef, (snap) => {
    const val = snap.val();
    latestState = val;

    if (val && val.roundStartedAt !== lastSeenRoundStart) {
      lastSeenRoundStart = val.roundStartedAt;
      localRoundKills = 0;
      update(ref(db, `players/${room}/${uid}`), { roundKills: 0 }).catch(() => {});
    }

    if (onStateChange) onStateChange(val);
  });

  onValue(playersRef, (snap) => { latestPlayers = snap.val() || {}; });

  ensureInitialized();
  const intervalId = setInterval(checkAndAdvance, CHECK_INTERVAL_MS);

  return {
    reportKill() {
      localRoundKills++;
      update(ref(db, `players/${room}/${uid}`), { roundKills: localRoundKills }).catch(() => {});
    },
    submitModeVote(modeId) {
      update(ref(db, `matchState/${room}/modeVotes`), { [uid]: modeId }).catch(() => {});
    },
    submitMapVote(mapId) {
      update(ref(db, `matchState/${room}/mapVotes`), { [uid]: mapId }).catch(() => {});
    },
    getState() { return latestState; },
    getPlayers() { return latestPlayers; },
    destroy() { clearInterval(intervalId); },
  };
}
