import { $, esc, shuffle, lines, keepAwake, initMenu, initAbout } from '../shared/common.js';

// Codenames: a board for the shared screen and a key card for the spymasters, kept in step
// through a room (see ROOM below). The board knows the key, so tapping a card turns it to its colour.
// Words come from words.txt; ?addon=WORD,WORD adds more. The revealed-card pictures are in img/,
// listed in images.json. ?demo turns a random card every second, for showing the board off.
const VERSION = '2.1', RELEASED = '2026-11-19';

const params = new URLSearchParams(location.search);
const views = ['choose', 'board', 'key'];
const show = name => { views.forEach(s => $(s).classList.toggle('hidden', s !== name)); $('btnRoom').classList.toggle('hidden', name === 'choose'); };

const BOARD_STORE = 'cn.board', KEY_STORE = 'cn.key', ROOM_STORE = 'cn.room';
const local = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// A game is the board and the key:
//   board = { words, turned }  the 25 words in order, and 1 for each card that's been turned over
//   key   = { first, cells }   who goes first, and what each of the 25 places is:
//                              'red' | 'blue' | 'bystander' | 'assassin' (9 / 8 / 7 / 1)
// Place i on the key is card i on the board. Both are shared through the room.
let words = [], board = null, key = null;
// Which parts this screen brings to a room. A board screen brings both (it needs the key to know
// each card's colour); a spymaster screen brings the key. A room missing a part gets it from the
// first screen that has it.
const mine = { board: false, key: false };
const validBoard = b => b && Array.isArray(b.words) && b.words.length === 25 && Array.isArray(b.turned) && b.turned.length === 25;
const validKey = k => k && (k.first === 'red' || k.first === 'blue') && Array.isArray(k.cells) && k.cells.length === 25;
const sameKey = (a, b) => a && b && a.first === b.first && a.cells.join() === b.cells.join();
const dealBoard = () => ({ words: shuffle([...words]).slice(0, 25), turned: Array(25).fill(0) });
function dealKey() {
  const first = Math.random() < .5 ? 'red' : 'blue', second = first === 'red' ? 'blue' : 'red';
  return { first, cells: shuffle([...Array(9).fill(first), ...Array(8).fill(second), ...Array(7).fill('bystander'), 'assassin']) };
}
function ensureGame() {
  if (!key) { const k = local.get(KEY_STORE); key = validKey(k) ? { first: k.first, cells: k.cells } : dealKey(); local.set(KEY_STORE, key); }
  if (!board) { const b = local.get(BOARD_STORE); board = validBoard(b) ? { words: b.words, turned: b.turned } : dealBoard(); local.set(BOARD_STORE, board); }
}
const save = () => { local.set(BOARD_STORE, board); local.set(KEY_STORE, key); };

// ───────────────────────── BOARD ─────────────────────────
// A face-down card is tan. Tap it when a team picks it and it turns to its colour from the key
// (grey bystander, red, blue, black assassin); 4 seconds later it shows a picture.
// Turning takes two taps, so a stray one does nothing: the first tap picks the card (it grows and
// gets a border), the second turns it. Moving the mouse off it, or a tap anywhere else, lets it go.
// The same two taps turn a turned card face down again, for a mistake.
const REVEAL_MS = 4000;
const COLOR = { bystander: 1, red: 2, blue: 3, assassin: 4 };
let built = '', demo = null;
const pics = { agent: [], agentbg: [], bystander: [], bystanderbg: [], black: [] };
const next = { agent: 0, agentbg: 0, bystander: 0, bystanderbg: 0 };
const pick = type => { const list = pics[type]; if (!list.length) return null; const url = list[next[type] % list.length]; next[type]++; return url; };
const colorOf = i => board.turned[i] && key ? COLOR[key.cells[i]] : 0;

async function loadImages() {
  let images = {};
  try { images = await (await fetch('images.json', { cache: 'no-cache' })).json(); } catch {}
  for (const type of Object.keys(pics)) pics[type] = shuffle((images[type] || []).map(f => 'img/' + f));
  // Fetch the pictures this board can show (at most 17 agents and 7 bystanders), so they're ready
  // when a card turns and saved for offline play.
  const want = [...pics.agent.slice(0, 17), ...pics.agentbg, ...pics.bystander.slice(0, 7), ...pics.bystanderbg, ...pics.black];
  for (const url of want) new Image().src = url;
}

// Show a card in a colour: with the flip, or at once (instant) when the board is first drawn.
// card.want is the colour it's heading for, so a change that arrives mid-flip isn't lost.
function paint(card, color, instant = false) {
  card.want = color;
  if (!instant && card.classList.contains('flipping')) { setTimeout(() => { if (card.want === color) paint(card, color); }, 650); return; }
  clearTimeout(card.revealTimer);
  const apply = () => {
    card.className = card.className.replace(/\bcolor-\d\b/, `color-${color}`);
    card.setAttribute('aria-pressed', color ? 'true' : 'false');
    const bg = card.querySelector('.bg'), fg = card.querySelector('.fg');
    bg.style.backgroundImage = fg.style.backgroundImage = '';
    if (color === 0) return;
    const reveal = () => {
      const [b, f] = color === 1 ? [pick('bystanderbg'), pick('bystander')]
        : color === 4 ? [null, pics.black[0]]
        : [pick('agentbg'), pick('agent')];
      if (b) bg.style.backgroundImage = `url('${b}')`;
      if (f) fg.style.backgroundImage = `url('${f}')`;
      card.classList.add('revealed');
    };
    if (instant) reveal(); else card.revealTimer = setTimeout(reveal, REVEAL_MS);
  };
  card.classList.remove('revealed');
  if (instant) return apply();
  card.classList.add('flipping');
  setTimeout(apply, 300);
  setTimeout(() => card.classList.remove('flipping'), 600);
}

// The card picked by a first tap (-1: none). Only this screen sees it.
let picked = -1;
function pickCard(i) {
  picked = i;
  [...$('wordBoard').children].forEach((cell, j) => cell.firstChild.classList.toggle('picked', j === i));
}
document.addEventListener('click', e => { if (picked >= 0 && !e.target.closest('.cn-card')) pickCard(-1); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && picked >= 0) pickCard(-1); });

// Draw the board's cards when its words change; after that, repaint() turns the cards that changed.
function buildBoard() {
  const el = $('wordBoard');
  el.innerHTML = ''; picked = -1;
  board.words.forEach((word, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'cn-cell';
    const card = document.createElement('button');
    card.className = 'cn-card color-0';
    card.innerHTML = '<div class="bg"></div><div class="fg"></div><div class="tint"></div><span class="word"></span>';
    card.querySelector('.word').textContent = word;
    card.onclick = () => { if (demo) return; if (picked === i) { pickCard(-1); tap(i); } else pickCard(i); };
    card.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && picked === i) pickCard(-1); });
    wrap.appendChild(card);
    el.appendChild(wrap);
    paint(card, colorOf(i), true);
  });
  built = board.words.join('|');
}
const cardAt = i => $('wordBoard').children[i]?.firstChild;
function repaint() {
  if (!mine.board) return;
  if (built !== board.words.join('|')) return buildBoard();
  board.words.forEach((_, i) => { const c = cardAt(i), want = colorOf(i); if (c && c.want !== want) paint(c, want); });
}
function renderLeft() {
  if (!key || !board) return;
  const left = team => key.cells.filter((c, i) => c === team && !board.turned[i]).length;
  const order = key.first === 'red' ? ['red', 'blue'] : ['blue', 'red'];
  $('boardLeft').innerHTML = order.map(t => `<span class="cn-left ${t}">${t === 'red' ? 'Red' : 'Blue'} <b>${left(t)}</b></span>`).join('');
  const hit = key.cells.findIndex((c, i) => c === 'assassin' && board.turned[i]);
  $('boardNote').textContent = hit >= 0 ? 'The assassin has been found!' : `${key.first === 'red' ? 'Red' : 'Blue'} goes first`;
}

// A card turned on this screen (or turned back face down): save it and tell the room.
function tap(i) {
  board.turned[i] = board.turned[i] ? 0 : 1;
  save(); repaint(); renderMarks(); renderLeft();
  send({ turned: board.turned });
}

// Demo: every second a random face-down card turns.
function startDemo() {
  demo = setInterval(() => {
    const down = board.turned.map((t, i) => t ? null : i).filter(i => i !== null);
    if (down.length) tap(down[Math.floor(Math.random() * down.length)]);
  }, 1000);
}

function openBoard() {
  ensureGame();
  mine.board = mine.key = true;
  repaint(); renderLeft();
  if (params.has('demo') && !demo) startDemo();
  history.replaceState(null, '', '#board');
  document.body.classList.add('cn-wide');
  show('board'); keepAwake(); startRoom(); fillRoom();
}

// New game, from either screen: new words, a new key, every card face down, for the whole room.
function newGame() {
  if (!confirm(others() ? `Start a new game? Every screen in room ${roomState.code} gets new words and a new key.` : 'Start a new game? New words and a new key.')) return;
  next.agent = next.agentbg = next.bystander = next.bystanderbg = 0;
  for (const type of Object.keys(pics)) shuffle(pics[type]);
  board = dealBoard(); key = dealKey(); save();
  repaint(); renderKey(); renderLeft();
  send({ words: board.words, turned: board.turned, first: key.first, cells: key.cells });
}

// ───────────────────────── SPYMASTER KEY ─────────────────────────
// 9 places for the team that goes first, 8 for the other, 7 bystanders, 1 assassin. The frame's
// colour says who goes first. A white dot marks each place whose card is turned on the board.
function renderKey() {
  if (!key) return;
  $('keyCard').className = `cn-key first-${key.first}`;
  $('keyCard').innerHTML = key.cells.map(c => `<div class="cn-spot ${c}">${c === 'assassin' ? '✕' : ''}</div>`).join('');
  $('keyFirst').className = `cn-first first-${key.first}`;
  $('keyFirst').textContent = `${key.first === 'red' ? 'Red' : 'Blue'} goes first`;
  renderMarks();
}
function renderMarks() {
  const turned = board ? board.turned : [];
  [...$('keyCard').children].forEach((spot, i) => spot.classList.toggle('turned', !!turned[i]));
}

function openKey() {
  ensureGame();
  mine.key = true;
  renderKey();
  history.replaceState(null, '', '#spymaster');
  document.body.classList.remove('cn-wide');
  show('key'); keepAwake(); startRoom(); fillRoom();
}

// ───────────────────────── ROOM ─────────────────────────
// Every screen, board or spymaster, is in a room (shared/rooms.js shareRoom), shown as a code in
// the top right. A screen starts in a random room of its own, so a game can start straight away.
// Tap the code and type another screen's code to join its game: the room's board and key then
// show on this screen too, and whatever the room lacks (a board, a key) this screen fills in.
// The room holds: words, turned (the board) and first, cells (the key).
// With no internet each screen works on its own.
let room = null, last = null, roomState = { text: 'Connecting…', on: false, count: 0, code: '' };
const others = () => roomState.code && roomState.count > 1;
const send = part => { if (room && room.code && room.code()) room.send(part).catch(() => {}); };
const ownParts = () => ({
  ...(mine.board ? { words: board.words, turned: board.turned } : {}),
  ...(mine.key ? { first: key.first, cells: key.cells } : {}),
});
// Give the room the parts it doesn't have yet.
function fillRoom() {
  if (!last || !room || !room.code) return;
  const part = {};
  if (mine.board && !validBoard(last)) Object.assign(part, { words: board.words, turned: board.turned });
  if (mine.key && !validKey(last)) Object.assign(part, { first: key.first, cells: key.cells });
  if (Object.keys(part).length) send(part);
}

function onRoomState(s) {
  last = s;
  if (!s) return;
  const newKey = validKey(s) && !sameKey(key, s);
  if (newKey) key = { first: s.first, cells: [...s.cells] };
  if (validBoard(s)) board = { words: [...s.words], turned: [...s.turned] };
  // A room with a key but no board: a board screen joining it starts face down (its turned cards
  // belonged to a different key), and a spymaster screen shows no dots.
  else if (board && (newKey || !mine.board)) board.turned = Array(25).fill(0);
  save();
  if (newKey) renderKey();
  repaint(); renderMarks(); renderLeft();
  fillRoom();
}

// The room button in the top right: the code, a dot for the connection and how many screens share it.
function renderRoom() {
  const r = roomState, b = $('btnRoom');
  const label = r.code ? `Room ${r.code}` : r.text;
  const extra = r.code && r.on && r.count > 1 ? ` · ${r.count} screens` : r.code && !r.on ? ` · ${r.text || 'Offline'}` : '';
  b.innerHTML = `<span class="dot ${r.on && r.code ? 'on' : ''}"></span>${esc(label)}<small>${esc(extra)}</small>`;
  $('roomMine').textContent = r.code || '—';
  $('roomCount').textContent = r.code && r.on
    ? (r.count > 1 ? `${r.count} screens are in this room.` : 'Only this screen is in the room so far.')
    : r.text || "You're offline.";
}

async function startRoom() {
  if (room) return;
  room = 'starting';
  if (!navigator.onLine) {
    room = null;
    roomState = { text: 'Offline', on: false, count: 0, code: '' }; renderRoom();
    addEventListener('online', startRoom, { once: true });
    return;
  }
  roomState = { text: 'Connecting…', on: false, count: 0, code: '' }; renderRoom();
  try {
    const { shareRoom } = await import('../shared/rooms.js');
    const r = shareRoom({
      game: 'cn',
      onState: onRoomState,
      onStatus: st => { roomState = st; if (st.code) local.set(ROOM_STORE, st.code); renderRoom(); },
    });
    room = r;
    // Back to the room this screen was in, if it's still there; otherwise a new one.
    const saved = local.get(ROOM_STORE);
    if (!saved || await r.join(saved) !== 'ok') await r.create(ownParts());
  } catch (e) {
    room = null;
    roomState = { text: 'No room', on: false, count: 0, code: '' }; renderRoom();
  }
}

// The room dialog: this screen's code, and a box to type another screen's code.
const dlg = $('roomDlg');
function openRoomDlg() {
  $('roomInput').value = ''; $('roomMsg').textContent = '';
  dlg.classList.remove('hidden'); renderRoom(); $('roomInput').focus();
}
const closeRoomDlg = () => dlg.classList.add('hidden');
async function joinRoom() {
  const code = $('roomInput').value.trim().toUpperCase();
  if (!room || room === 'starting') { $('roomMsg').textContent = "You're offline. Joining a room needs internet."; return; }
  if (code === roomState.code) { closeRoomDlg(); return; }
  $('roomMsg').textContent = 'Joining…'; $('btnRoomJoin').disabled = true;
  try {
    const res = await room.join(code);
    const msg = {
      bad: 'Room codes are 4 letters and numbers.',
      empty: `There's no Codenames game in room ${code}. Check the code on the other screen.`,
      other: `Room ${code} is another game's room. Check the code on the other screen.`,
    }[res];
    if (msg) $('roomMsg').textContent = msg; else closeRoomDlg();
  } catch (e) {
    $('roomMsg').textContent = 'Could not reach the game database: ' + (e.message || e);
  } finally { $('btnRoomJoin').disabled = false; }
}
$('btnRoom').onclick = openRoomDlg;
$('btnRoomJoin').onclick = joinRoom;
$('btnRoomCancel').onclick = closeRoomDlg;
$('roomInput').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
dlg.addEventListener('click', e => { if (e.target === dlg) closeRoomDlg(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRoomDlg(); });

function openChoose() {
  history.replaceState(null, '', location.pathname + location.search);
  document.body.classList.remove('cn-wide');
  show('choose');
}

// ───────────────────────── PAGE ─────────────────────────
const showAbout = initAbout({ version: VERSION, released: RELEASED, cardsText: async () => `${words.length} words.` });
const fullScreen = () => { try { document.documentElement.requestFullscreen(); } catch {} };
initMenu(() => {
  const view = views.find(v => !$(v).classList.contains('hidden'));
  return [
    ...(view !== 'choose' ? [['New game', newGame]] : []),
    ...(view === 'board' ? [...(document.fullscreenEnabled ? [['Full screen', fullScreen]] : []), ['Spymaster key', openKey]] : []),
    ...(view === 'key' ? [['Board', openBoard]] : []),
    ...(view !== 'choose' ? [['Room', openRoomDlg]] : []),
    ...(view !== 'choose' ? [['Change screen', openChoose]] : []),
    ['About', showAbout],
  ];
});

$('btnBoard').onclick = openBoard;
$('btnKey').onclick = openKey;
$('btnNewKey').onclick = newGame;

try {
  words = [...new Set(await lines('words.txt'))];
} catch {
  words = [];
}
const addon = params.get('addon');
if (addon) words.push(...addon.split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
loadImages();

if (words.length < 25) {
  $('btnBoard').disabled = true;
  $('status').textContent = 'Could not load words.txt — open this page from a web server.';
}
if (location.hash === '#board' && words.length >= 25) openBoard();
else if (location.hash === '#spymaster') openKey();
else openChoose();
