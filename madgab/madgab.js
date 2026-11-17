import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getDatabase, ref, set, onValue, onDisconnect, runTransaction } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js';
import { $, esc, fmt, store, lines, keepAwake, initMenu, initAbout, createRounds } from '../shared/common.js';

// Mad Gab: a proctor device runs the game; viewer devices show the team only the puzzle.
// They sync through Firebase Realtime Database: rooms/<CODE>/{owner,state,viewers}.
const VERSION = '1.6', RELEASED = '2026-11-17';

const db = getDatabase(initializeApp({
  apiKey: 'AIzaSyDbzdtJUIyNIsZ1CnxArgwa8G7mfqb1sKQ',
  authDomain: 'madgab-b4a1e.firebaseapp.com',
  databaseURL: 'https://madgab-b4a1e-default-rtdb.firebaseio.com',
  projectId: 'madgab-b4a1e',
  appId: '1:168797707932:web:4cff56d10c1d38319bd759',
}));

// Server clock offset, so the viewer's countdown matches the proctor's even if device clocks differ.
let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
const now = () => Date.now() + offset;
// A per-tab id: the proctor's claim on its room code, or a viewer's presence entry.
const ME = (() => {
  let id = null;
  try { id = sessionStorage.getItem('mg.me'); } catch {}
  if (!id) { id = Math.random().toString(36).slice(2, 12); try { sessionStorage.setItem('mg.me', id); } catch {} }
  return id;
})();
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const sections = ['home', 'demo', 'join', 'viewer', 'setup', 'ready', 'play', 'over'];
const show = name => sections.forEach(s => $(s).classList.toggle('hidden', s !== name));
const st = store('mg');
const setStatus = (text, on) => { $('status').innerHTML = `<span class="dot ${on ? 'on' : ''}"></span>${esc(text)}`; };

function renderScores(el, teams, current) {
  el.innerHTML = teams.map((t, i) =>
    `<div class="team ${i === current ? 'current' : ''}">${esc(t.name)}<b>${t.score}</b></div>`).join('');
}

let role = null;

// ───────────────────────── PROCTOR ─────────────────────────
let G = null;               // the round engine, once the cards are loaded
let room = null, viewers = 0;
const level = () => $('optLevel').value;

async function loadCards() {
  const [text, hardText] = await Promise.all([lines('flashcards.txt'), lines('hard.txt').catch(() => [])]);
  const hard = new Set(hardText.map(s => s.toLowerCase()));
  const seen = new Set(), cards = [];
  for (const line of text) {
    const i = line.indexOf(',');
    if (i < 1) continue;
    const puzzle = line.slice(0, i).trim(), answer = line.slice(i + 1).trim();
    if (!puzzle || !answer || seen.has(puzzle.toLowerCase())) continue;
    seen.add(puzzle.toLowerCase());
    cards.push({ puzzle, answer, hard: hard.has(puzzle.toLowerCase()) });
  }
  return cards;
}

async function startProctor() {
  role = 'proctor'; show('setup'); keepAwake();
  $('optLevel').value = st.get('level', 'all');
  let cards;
  try { cards = await loadCards(); } catch {
    $('deckInfo').textContent = 'Could not load flashcards.txt — open this page from a web server, not as a local file.';
    return;
  }
  G = createRounds({
    prefix: 'mg', cards, show,
    fits: i => level() === 'all' || (level() === 'hard') === cards[i].hard,
    deckName: () => ({ easy: 'easy', hard: 'hard', all: '' }[level()]),
    info: () => `${$('optLevel').selectedOptions[0].textContent} cards`,
    renderCard: c => { $('pPuzzle').textContent = c.puzzle; $('pAnswer').textContent = c.answer; },
    result: r => [r.answer, r.puzzle],
    onChange: send,
  });
  $('optLevel').onchange = () => { st.set('level', level()); G.updateDeckInfo(); };
  let saved = null; try { saved = sessionStorage.getItem('mg.code'); } catch {}
  openRoom(saved || newCode());
}

function newCode() { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }

async function openRoom(code) {
  setStatus('Opening room…', false);
  let res;
  try {
    // Claim the code unless another proctor is using it (claims go stale after 12 hours).
    res = await runTransaction(ref(db, `rooms/${code}/owner`), cur => {
      if (!cur || cur.id === ME || now() - cur.at > 12 * 3600e3) return { id: ME, at: now() };
      return undefined;
    });
  } catch (e) {
    setStatus('Sync error', false);
    $('viewerCount').textContent = 'Could not reach the game database: ' + (e.message || e);
    return;
  }
  if (!res.committed) return openRoom(newCode());
  room = code;
  try { sessionStorage.setItem('mg.code', code); } catch {}
  $('roomCode').textContent = code;
  const url = location.origin + location.pathname + '?join=' + code;
  $('joinLink').textContent = url.replace(/^https?:\/\//, ''); $('joinLink').href = url;
  $('qr').innerHTML = '';
  if (window.QRCode) new QRCode($('qr'), { text: url, width: 160, height: 160 });
  onValue(ref(db, `rooms/${code}/viewers`), snap => { viewers = snap.size; updateViewerCount(); });
  onValue(ref(db, '.info/connected'), c => setStatus(c.val() ? 'Room ' + code : 'Reconnecting…', !!c.val()));
  send();
}

function updateViewerCount() {
  $('viewerCount').textContent = viewers ? `${viewers} viewer${viewers > 1 ? 's' : ''} connected ✓` : 'Waiting for a viewer…';
}

// What the viewers see. Answers only go out once the round is over.
function viewState() {
  const s = { phase: G.phase, teams: G.teams, current: G.current };
  if (G.phase === 'playing') { s.puzzle = G.card.puzzle; s.endsAt = G.endsAt + offset; }
  if (G.phase === 'paused') { s.puzzle = null; s.left = G.pausedLeft; }
  if (G.phase === 'over') s.results = G.results;
  if (G.phase === 'setup') s.left = G.roundMs;
  return s;
}
function send() {
  if (!room || !G) return;
  set(ref(db, `rooms/${room}/state`), viewState())
    .catch(e => setStatus('Sync error: ' + (e.code || e.message), false));
}

async function leaveGame() {
  if (!confirm('Leave this game? The viewer will see that it has ended.')) return;
  if (G) G.stop();
  if (room) { try { await set(ref(db, `rooms/${room}/state`), { phase: 'closed' }); } catch {} }
  try { sessionStorage.removeItem('mg.code'); } catch {}
  location.href = location.pathname;
}

$('btnProctor').onclick = startProctor;

// ───────────────────────── VIEWER ─────────────────────────
const V = { code: '', state: null, unsubs: [] };

function startViewer(code) {
  role = 'viewer'; keepAwake();
  if (code) return join(code);
  show('join'); $('joinCode').focus();
}

function join(code) {
  code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) { $('joinMsg').textContent = 'The code is 4 letters.'; return; }
  V.code = code; show('join'); $('joinCode').value = code;
  $('joinMsg').textContent = 'Connecting…'; setStatus('Connecting…', false);
  V.unsubs.forEach(u => u()); V.unsubs = [];
  const me = ref(db, `rooms/${code}/viewers/${ME}`);
  V.unsubs.push(onValue(ref(db, '.info/connected'), c => {
    if (c.val()) { onDisconnect(me).remove(); set(me, true).catch(() => {}); }
    setStatus(c.val() ? 'Room ' + code : 'Reconnecting…', !!c.val());
  }));
  V.unsubs.push(onValue(ref(db, `rooms/${code}/state`), snap => {
    const s = snap.val();
    if (!s) {
      show('join');
      $('joinMsg').textContent = `No game in room ${code} yet. Check the code on the proctor's screen — this page will join as soon as it's open.`;
      return;
    }
    history.replaceState(null, '', '?join=' + code);
    V.state = s; show('viewer'); renderViewer();
  }, err => { $('joinMsg').textContent = 'Could not reach the game database: ' + err.message; }));
}

function renderViewer() {
  const s = V.state; if (!s) return;
  s.teams = s.teams || []; s.results = s.results || [];
  renderScores($('vScores'), s.teams, s.current);
  const team = s.teams[s.current] ? s.teams[s.current].name : '';
  $('vResultsBox').classList.toggle('hidden', s.phase !== 'over');
  $('vClock').classList.toggle('hidden', s.phase === 'over' || s.phase === 'closed');
  if (s.phase === 'playing') {
    $('vPuzzle').textContent = s.puzzle; $('vBanner').textContent = '';
  } else if (s.phase === 'paused') {
    $('vPuzzle').textContent = ''; $('vBanner').textContent = 'Paused';
  } else if (s.phase === 'closed') {
    $('vPuzzle').textContent = ''; $('vBanner').textContent = 'The proctor ended this game.';
  } else if (s.phase === 'over') {
    const got = s.results.filter(r => r.got).length;
    $('vPuzzle').textContent = ''; $('vBanner').textContent = `Time! ${team} got ${got}`;
    $('vResults').innerHTML = s.results.length ? s.results.map(r =>
      `<li class="${r.got ? 'got' : 'skip'}"><span class="mark">${r.got ? '✓' : '✗'}</span>
       <span><div>${esc(r.answer)}</div><div class="p">${esc(r.puzzle)}</div></span></li>`).join('')
      : '<li class="muted">No cards this round.</li>';
  } else {
    $('vPuzzle').textContent = ''; $('vBanner').textContent = `${team}, get ready…`;
  }
  viewerClock();
}
function viewerClock() {
  const s = V.state; if (!s) return;
  const left = s.phase === 'playing' ? s.endsAt - now() : (s.left || 0);
  $('vClock').textContent = fmt(left);
  $('vClock').classList.toggle('low', s.phase === 'playing' && left <= 10000);
}
setInterval(viewerClock, 250);

$('btnViewer').onclick = () => startViewer('');
$('btnJoin').onclick = () => join($('joinCode').value);
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') join($('joinCode').value); });

// ───────────────────────── DEMO ─────────────────────────
// Examples that aren't in the deck: show the puzzle, then the answer.
const DEMO = [{ puzzle: 'Olive Yew', answer: 'I Love You' }];
let demoAt = 0, demoShown = false;
function demoRender() {
  const done = demoAt >= DEMO.length;
  ['dStep', 'dPuzzle', 'dHint', 'btnDemoNext'].forEach(id => $(id).classList.toggle('hidden', done));
  $('dHow').classList.toggle('hidden', !done);
  $('dAnswer').classList.toggle('hidden', done || !demoShown);
  if (done) return;
  const c = DEMO[demoAt];
  $('dStep').textContent = DEMO.length > 1 ? `Example ${demoAt + 1} of ${DEMO.length}` : 'Example';
  $('dPuzzle').textContent = c.puzzle;
  $('dAnswer').textContent = c.answer;
  $('dHint').classList.toggle('hidden', demoShown);
  $('btnDemoNext').textContent = !demoShown ? 'Show the answer' : demoAt + 1 < DEMO.length ? 'Next example' : 'How to play';
}
$('btnDemo').onclick = () => { demoAt = 0; demoShown = false; show('demo'); demoRender(); };
$('btnDemoNext').onclick = () => { if (!demoShown) demoShown = true; else { demoAt++; demoShown = false; } demoRender(); };
$('btnDemoAgain').onclick = () => { demoAt = 0; demoShown = false; demoRender(); };
$('btnDemoDone').onclick = () => show('home');

// ───────────────────────── MENU / ABOUT ─────────────────────────
const showAbout = initAbout({
  version: VERSION, released: RELEASED,
  async cardsText() {
    const cards = await loadCards();
    const h = cards.filter(c => c.hard).length;
    return `${cards.length.toLocaleString()} cards: ${(cards.length - h).toLocaleString()} easy, ${h.toLocaleString()} hard.`;
  },
});
initMenu(() => {
  const items = [];
  if (role === 'proctor') items.push(
    ['New game', () => G && G.newGame()],
    ['Reshuffle deck', () => G && G.reshuffle()],
    ['Leave game', leaveGame, 'danger'],
  );
  else if (role === 'viewer') items.push(['Leave room', () => { location.href = location.pathname; }, 'danger']);
  else {
    items.push(['How to play', () => $('btnDemo').click()]);
    if ($('home').classList.contains('hidden')) items.push(['Start page', () => show('home')]);
    items.push(['All games', () => { location.href = '../'; }]);
  }
  return [...items, ['About', showAbout]];
});

// ───────────────────────── START ─────────────────────────
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) startViewer(joinParam);
else if (sessionStorage.getItem('mg.code')) startProctor();   // a proctor reloading keeps its room
else show('home');
