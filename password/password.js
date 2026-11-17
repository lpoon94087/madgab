import { $, esc, store, lines, shuffle, keepAwake, initMenu, initAbout, beep } from '../shared/common.js';
import { hostRoom, viewRoom, savedRoom } from '../shared/rooms.js';

// Password: two teams, each a clue-giver and a guesser. The team that's guessing gets a
// one-word clue and one guess; right scores what the word is worth (10, less one per clue),
// wrong passes the next clue to the other team. First to the target score wins.
// The moderator runs it; viewers are a clue-giver screen (with the word) or a scoreboard
// (without it), synced through a room (shared/rooms.js).
const VERSION = '1.0', RELEASED = '2026-11-17';
const START_VALUE = 10;

const sections = ['home', 'join', 'viewer', 'setup', 'play', 'done', 'over'];
let at = 'home', role = null, room = null;
const show = name => { at = name; sections.forEach(s => $(s).classList.toggle('hidden', s !== name)); };
const st = store('pw');

// How to play
const howto = $('howto');
const openHow = () => { howto.classList.remove('hidden'); $('btnHowClose').focus(); };
const closeHow = () => howto.classList.add('hidden');
$('btnHowClose').onclick = closeHow;
howto.addEventListener('click', e => { if (e.target === howto) closeHow(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHow(); });

// ───────────── Shared drawing ─────────────
// Scores, with the guessing team's box lit in its colour and marked "guessing".
function scoresHtml(teams, guessing) {
  return teams.map((t, i) => {
    const on = i === guessing;
    return `<div class="team ${on ? 'g' + i : ''}">${on ? '<div class="who">Guessing</div>' : ''}${esc(t.name)}<b>${t.score}</b></div>`;
  }).join('');
}
function turnHtml(teams, guessing) {
  return `${esc(teams[guessing].name)} guessing<small>Their clue-giver gives a one-word clue</small>`;
}
const worthHtml = v => `${v}<small>point${v === 1 ? '' : 's'}</small>`;

// ───────────── Moderator ─────────────
let words = [];
// G is the whole game; it's saved after every change so a reload carries on.
// phase: setup | word | scored | dead | over
let G = null, history = [];
const fresh = () => ({
  phase: 'setup', teams: [{ name: 'Team A', score: 0 }, { name: 'Team B', score: 0 }], target: 25,
  starter: 0, guessing: 0, value: START_VALUE, word: '', last: null,
});

// Deck: a shuffled order of the words, saved so words don't repeat until it runs out.
function draw() {
  let d = st.get('deck', null);
  if (!d || d.n !== words.length || !d.order.length) d = { n: words.length, order: shuffle(words.map((_, i) => i)) };
  const w = words[d.order.pop()]; st.set('deck', d); return w;
}
const deckLeft = () => { const d = st.get('deck', null); return d && d.n === words.length ? d.order.length : words.length; };

function save() { st.set('game', G); if (room) room.send(); render(); }
function act(fn) { history.push(JSON.stringify(G)); if (history.length > 50) history.shift(); fn(); save(); }
function undo() { if (!history.length) return; G = JSON.parse(history.pop()); save(); }

function newWord() { G.word = draw(); G.value = START_VALUE; G.guessing = G.starter; G.phase = 'word'; G.last = null; }
function got() {
  act(() => {
    const t = G.teams[G.guessing]; t.score += G.value;
    G.last = { team: G.guessing, points: G.value, word: G.word };
    G.phase = t.score >= G.target ? 'over' : 'scored';
    G.starter = 1 - G.starter;
    beep(1046, .12);
  });
}
function wrong() {
  act(() => {
    G.value--;
    if (G.value <= 0) { G.last = { team: null, points: 0, word: G.word }; G.phase = 'dead'; G.starter = 1 - G.starter; beep(220, .4, .25); }
    else G.guessing = 1 - G.guessing;
  });
}
function skip() { act(() => { G.word = draw(); G.value = START_VALUE; G.guessing = G.starter; }); }

function startGame() {
  act(() => {
    const a = $('optTeamA').value.trim() || 'Team A', b = $('optTeamB').value.trim() || 'Team B';
    G.teams = [{ name: a, score: 0 }, { name: b, score: 0 }];
    G.target = Number($('optTarget').value); G.starter = 0;
    st.set('setup', { a, b, target: G.target });
    newWord();
  });
  keepAwake();
}
function playAgain() { act(() => { G.teams.forEach(t => t.score = 0); G.starter = 0; newWord(); }); }
function newGame() {
  if (!confirm('Start a new game? Both teams go back to 0.')) return;
  act(() => { const k = G; G = fresh(); G.teams = k.teams.map(t => ({ name: t.name, score: 0 })); G.target = k.target; });
}

function render() {
  if (role !== 'moderator') return;
  const { teams, guessing } = G;
  ['pScores', 'dScores', 'oScores'].forEach(id => $(id).innerHTML = scoresHtml(teams, G.phase === 'word' ? guessing : -1));
  $('deckInfo').textContent = `${words.length.toLocaleString()} words; ${deckLeft().toLocaleString()} left before they repeat. Each word starts at ${START_VALUE} points.`;
  for (const id of ['btnUndo', 'btnUndo2', 'btnUndo3']) $(id).disabled = !history.length;
  if (G.phase === 'setup') return show('setup');
  if (G.phase === 'word') {
    $('pTurn').className = 'turn t' + guessing; $('pTurn').innerHTML = turnHtml(teams, guessing);
    $('pWorth').innerHTML = worthHtml(G.value);
    $('pWord').textContent = G.word;
    $('btnGot').innerHTML = `Got it<small>${esc(teams[guessing].name)} +${G.value}</small>`;
    $('btnWrong').innerHTML = `Wrong<small>${G.value > 1 ? 'pass to ' + esc(teams[1 - guessing].name) : 'nobody scores'}</small>`;
    return show('play');
  }
  if (G.phase === 'over') {
    $('oBanner').textContent = `${teams[G.last.team].name} wins! 🎉`;
    return show('over');
  }
  const L = G.last;
  $('dBanner').textContent = L.team === null ? 'Nobody got it' : `${teams[L.team].name} +${L.points}`;
  $('dWord').innerHTML = `The word was <b>${esc(L.word)}</b> · ${esc(teams[G.starter].name)} gives the first clue next`;
  show('done');
}

// What viewers get. Every screen in the room gets the same state; the scoreboard just doesn't show the word.
function viewState() {
  const s = { phase: G.phase, teams: G.teams, guessing: G.guessing, value: G.value, target: G.target };
  if (G.phase === 'word') s.word = G.word;
  if (G.last) s.last = G.last;
  if (G.phase !== 'setup') s.starter = G.starter;
  return s;
}

async function leaveGame() {
  if (!confirm('Leave this game? Viewers will see that it has ended.')) return;
  if (room) await room.close();
  st.set('game', null);
  location.href = location.pathname;
}

async function startModerator() {
  if (role) return;
  role = 'moderator'; show('setup');
  const s = st.get('setup', null);
  if (s) { $('optTeamA').value = s.a; $('optTeamB').value = s.b; $('optTarget').value = String(s.target); }
  try { words = await lines('words.txt'); } catch {
    $('deckInfo').textContent = 'Could not load words.txt — open this page from a web server, not as a local file.';
    $('btnStart').disabled = true; return;
  }
  G = st.get('game', null) || fresh();
  room = hostRoom({ game: 'pw', state: viewState });
  render();
}

$('btnStart').onclick = startGame;
$('btnGot').onclick = got;
$('btnWrong').onclick = wrong;
$('btnSkip').onclick = skip;
$('btnNext').onclick = () => act(newWord);
$('btnAgain').onclick = playAgain;
['btnUndo', 'btnUndo2', 'btnUndo3'].forEach(id => $(id).onclick = undo);

// ───────────── Viewers ─────────────
// A clue-giver screen shows the word; a scoreboard never shows it.
function renderView(s, board) {
  const teams = s.teams || [];
  const playing = s.phase === 'word';
  $('vScores').innerHTML = teams.length ? scoresHtml(teams, playing ? s.guessing : -1) : '';
  $('vTurn').className = playing ? 'turn t' + s.guessing : 'hidden';
  $('vTurn').innerHTML = playing ? turnHtml(teams, s.guessing) : '';
  $('vWorth').innerHTML = playing ? worthHtml(s.value) : '';
  $('vWord').textContent = playing && !board ? s.word : '';
  const L = s.last;
  $('vBanner').innerHTML =
    s.phase === 'closed' ? 'The moderator ended this game.' :
    s.phase === 'setup' ? 'Waiting for the moderator…' :
    s.phase === 'over' ? `${esc(teams[L.team].name)} wins! 🎉<div class="muted" style="font-size:18px;font-weight:400">The last word was <b>${esc(L.word)}</b></div>` :
    s.phase === 'scored' ? `${esc(teams[L.team].name)} +${L.points}<div class="muted" style="font-size:18px;font-weight:400">The word was <b>${esc(L.word)}</b></div>` :
    s.phase === 'dead' ? `Nobody got it<div class="muted" style="font-size:18px;font-weight:400">The word was <b>${esc(L.word)}</b></div>` :
    board ? `Play to ${s.target}` : '';
}
const viewer = viewRoom({ game: 'pw', show, render: renderView, params: { view: 'clue', board: 'board' } });
function startViewer(code, board) { role = 'viewer'; viewer.open(code, board); }
// A QR code link (?join=CODE) lands on the home screen so the person picks clue giver or scoreboard.
const params = new URLSearchParams(location.search);
const joining = (params.get('join') || '').toUpperCase();
$('btnClue').onclick = () => startViewer(joining, false);
$('btnBoard').onclick = () => startViewer(joining, true);
$('btnModerator').onclick = startModerator;

// ───────────── Menu / About ─────────────
const showAbout = initAbout({
  version: VERSION, released: RELEASED,
  cardsText: async () => `${(await lines('words.txt')).length.toLocaleString()} words.`,
});
initMenu(() => {
  const items = [];
  if (role === 'moderator') items.push(['New game', newGame], ['Leave game', leaveGame, 'danger']);
  else if (role === 'viewer') items.push(['Leave room', () => { location.href = location.pathname; }, 'danger']);
  items.push(['How to play', openHow]);
  if (!role) items.push(['All games', () => { location.href = '../'; }]);
  return [...items, ['About', showAbout]];
});

// ───────────── Start ─────────────
if (params.get('clue')) startViewer(params.get('clue'), false);
else if (params.get('board')) startViewer(params.get('board'), true);
else if (joining) {
  $('btnModerator').classList.add('hidden');
  $('joinNote').classList.remove('hidden'); $('joinNote').textContent = `Joining room ${joining}: pick a screen`;
  show('home');
}
else if (savedRoom('pw')) startModerator();   // a moderator reloading keeps their room and game
else show('home');
