import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getDatabase, ref, set, onValue, onDisconnect, runTransaction } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js';
import { $, esc, fmt, keepAwake } from './common.js';

// Rooms: one moderator device runs a game, any number of viewer devices show a read-only copy.
// They sync through Firebase Realtime Database: rooms/<CODE>/{owner,state,viewers}
// (rules in database.rules.json). `game` ('mg', 'wg') keeps each game's rooms apart.
//
// The state a moderator sends (built by roundState, or by the game for its own phases):
//   game, phase   'setup' | 'playing' | 'paused' | 'over' | 'closed' | 'free'
//   teams, current           scores and whose turn it is (optional: no teams, no scorebar)
//   card, note               the card text the viewer shows, and a label above it
//   endsAt / left            the clock: server time the round ends, or ms left while stopped
//   results                  [{ main, sub, got }] once the round is over
//   banner                   optional: overrides the viewer's message for this phase

const db = getDatabase(initializeApp({
  apiKey: 'AIzaSyDbzdtJUIyNIsZ1CnxArgwa8G7mfqb1sKQ',
  authDomain: 'madgab-b4a1e.firebaseapp.com',
  databaseURL: 'https://madgab-b4a1e-default-rtdb.firebaseio.com',
  projectId: 'madgab-b4a1e',
  appId: '1:168797707932:web:4cff56d10c1d38319bd759',
}));

// Server clock offset, so a viewer's countdown matches the moderator's even if device clocks differ.
let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
const now = () => Date.now() + offset;

const session = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  remove(k) { try { sessionStorage.removeItem(k); } catch {} },
};
// A per-tab id: the moderator's claim on its room code, or a viewer's presence entry.
function tabId(game) {
  let id = session.get(game + '.me');
  if (!id) { id = Math.random().toString(36).slice(2, 12); session.set(game + '.me', id); }
  return id;
}
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const setStatus = (text, on) => { $('status').innerHTML = `<span class="dot ${on ? 'on' : ''}"></span>${esc(text)}`; };

// The room this tab is hosting, if it has one (a moderator reloading keeps its room).
export const savedRoom = game => session.get(game + '.code');

// The viewer state for a createRounds engine. card(c) is what viewers see of a card
// (never the answer); result(r) gives [main, sub] for the results list.
export function roundState(G, { card, note, result }) {
  const s = { phase: G.phase, teams: G.teams, current: G.current };
  if (G.phase === 'playing') { s.card = card(G.card); s.note = note ? note(G.card) : ''; s.endsAt = G.endsAt + offset; }
  if (G.phase === 'paused') s.left = G.pausedLeft;
  if (G.phase === 'setup') s.left = G.roundMs;
  if (G.phase === 'over') s.results = G.results.map(r => { const [main, sub] = result(r); return { main, sub: sub || '', got: r.got }; });
  return s;
}

// ───────────────────────── MODERATOR ─────────────────────────
// Opens a room and fills the page's #roomCode, #qr, #viewerCount and #status.
// state() returns what viewers should see; call send() whenever it changes.
export function hostRoom({ game, state }) {
  const ME = tabId(game);
  let code = null;

  async function open(c) {
    setStatus('Opening room…', false);
    let res;
    try {
      // Claim the code unless another moderator is using it (claims go stale after 12 hours).
      res = await runTransaction(ref(db, `rooms/${c}/owner`), cur => {
        if (!cur || cur.id === ME || now() - cur.at > 12 * 3600e3) return { id: ME, at: now() };
        return undefined;
      });
    } catch (e) {
      setStatus('Sync error', false);
      $('viewerCount').textContent = 'Could not reach the game database: ' + (e.message || e);
      return;
    }
    if (!res.committed) return open(newCode());
    code = c; session.set(game + '.code', c);
    $('roomCode').textContent = c;
    const url = location.origin + location.pathname + '?join=' + c;
    $('qr').innerHTML = '';
    if (window.QRCode) new QRCode($('qr'), { text: url, width: 160, height: 160 });
    onValue(ref(db, `rooms/${c}/viewers`), snap => {
      const n = snap.size;
      $('viewerCount').textContent = n ? `${n} viewer${n > 1 ? 's' : ''} connected ✓` : 'Waiting for a viewer…';
    });
    onValue(ref(db, '.info/connected'), x => setStatus(x.val() ? 'Room ' + c : 'Reconnecting…', !!x.val()));
    send();
  }
  function send() {
    if (!code) return;
    set(ref(db, `rooms/${code}/state`), { ...state(), game })
      .catch(e => setStatus('Sync error: ' + (e.code || e.message), false));
  }
  // Tell the viewers the game is over and give up the code.
  async function close() {
    if (code) { try { await set(ref(db, `rooms/${code}/state`), { phase: 'closed', game }); } catch {} }
    session.remove(game + '.code');
  }

  open(savedRoom(game) || newCode());
  return { send, close };
}

// ───────────────────────── VIEWER ─────────────────────────
// A read-only screen. The page needs the #join section (joinCode, btnJoin, joinMsg) and the
// #viewer section (vScores, vClock, vNote, vCard, vBanner, vResultsBox, vResults).
// show(name) switches between them. Call open(code), or open('') to ask for a code.
// open(code, true) makes it a scoreboard: the clock and scores, never the card,
// and the results once a round is over. The scoreboard only hides the card: every screen
// in a room gets the same state.
// Options: render(state, board) draws a game's own viewer screen instead of the standard one;
// params names the URL parameters for a viewer and a scoreboard (default join / board).
export function viewRoom({ game, show, render: custom, params = { view: 'join', board: 'board' } }) {
  const ME = tabId(game);
  let code = '', state = null, unsubs = [], clock = null, board = false;

  function join(raw) {
    code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 4) { $('joinMsg').textContent = 'The code is 4 letters.'; return; }
    show('join'); $('joinCode').value = code;
    $('joinMsg').textContent = 'Connecting…'; setStatus('Connecting…', false);
    unsubs.forEach(u => u()); unsubs = [];
    const me = ref(db, `rooms/${code}/viewers/${ME}`);
    unsubs.push(onValue(ref(db, '.info/connected'), c => {
      if (c.val()) { onDisconnect(me).remove(); set(me, true).catch(() => {}); }
      setStatus(c.val() ? 'Room ' + code : 'Reconnecting…', !!c.val());
    }));
    unsubs.push(onValue(ref(db, `rooms/${code}/state`), snap => {
      const s = snap.val();
      // Rooms from before `game` existed are Mad Gab's.
      if (s && (s.game || 'mg') !== game) {
        show('join'); $('joinMsg').textContent = `Room ${code} is running a different game. Check the code.`;
        return;
      }
      if (!s) {
        show('join');
        $('joinMsg').textContent = `No game in room ${code} yet. Check the code on the moderator's screen — this page will join as soon as it's open.`;
        return;
      }
      history.replaceState(null, '', `?${board ? params.board : params.view}=` + code);
      state = s; show('viewer'); custom ? custom(s, board) : render();
    }, err => { $('joinMsg').textContent = 'Could not reach the game database: ' + err.message; }));
    clearInterval(clock); clock = setInterval(tick, 250);
  }

  function render() {
    const s = state, teams = s.teams || [], results = s.results || [];
    const team = teams[s.current] ? teams[s.current].name : '';
    $('vScores').innerHTML = teams.map((t, i) =>
      `<div class="team ${i === s.current ? 'current' : ''}">${esc(t.name)}<b>${t.score}</b></div>`).join('');
    $('vScores').classList.toggle('hidden', !teams.length || s.phase === 'free');
    $('vClock').classList.toggle('hidden', !['setup', 'playing', 'paused'].includes(s.phase));
    $('vResultsBox').classList.toggle('hidden', s.phase !== 'over');
    const showCard = !board && (s.phase === 'playing' || s.phase === 'free');
    $('vCard').textContent = showCard ? s.card || '' : '';
    $('vNote').textContent = showCard ? s.note || '' : '';
    const got = results.filter(r => r.got).length;
    const banners = {
      playing: '', paused: 'Paused',
      free: board ? 'Playing words with no clock. Scores show in timed rounds.' : '',
      closed: 'The moderator ended this game.',
      over: `Time! ${team} got ${got}`,
    };
    $('vBanner').textContent = s.banner || (s.phase in banners ? banners[s.phase] : `${team}, get ready…`);
    if (s.phase === 'over') {
      $('vResults').innerHTML = results.length ? results.map(r =>
        `<li class="${r.got ? 'got' : 'skip'}"><span class="mark">${r.got ? '✓' : '✗'}</span>
         <span><div>${esc(r.main)}</div>${r.sub ? `<div class="p">${esc(r.sub)}</div>` : ''}</span></li>`).join('')
        : '<li class="muted">No cards this round.</li>';
    }
    tick();
  }
  function tick() {
    if (!state || custom) return;
    const left = state.phase === 'playing' ? state.endsAt - now() : (state.left || 0);
    $('vClock').textContent = fmt(left);
    $('vClock').classList.toggle('low', state.phase === 'playing' && left <= 10000);
  }

  $('btnJoin').onclick = () => join($('joinCode').value);
  $('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') join($('joinCode').value); });

  return {
    open(c, asBoard = false) {
      board = asBoard; $('viewer').classList.toggle('board', board); keepAwake();
      if (c) join(c); else { show('join'); $('joinCode').focus(); }
    },
  };
}
