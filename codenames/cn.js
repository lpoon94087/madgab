import { $, esc, shuffle, lines, keepAwake, initMenu, initAbout } from '../shared/common.js';

// Codenames: a board for the shared screen and a key card for the spymasters, kept in step
// through a room (see ROOM below).
// Words come from words.txt; ?addon=WORD,WORD adds more. The revealed-card pictures are in img/,
// listed in images.json. ?demo reveals random cards every second, for showing the board off.
const VERSION = '1.4', RELEASED = '2026-11-19';

const params = new URLSearchParams(location.search);
const views = ['choose', 'board', 'key'];
const show = name => { views.forEach(s => $(s).classList.toggle('hidden', s !== name)); $('btnRoom').classList.toggle('hidden', name === 'choose'); };

// ───────────────────────── BOARD ─────────────────────────
// A card's colour: 0 tan (not guessed yet), 1 grey (bystander), 2 red, 3 blue, 4 black (assassin).
// Tapping flips it to the next colour; 4 seconds later a guessed card shows its picture.
// board = { words, colors }: the 25 words in order and each card's colour. It's shared through the
// room (see ROOM below), so a reload or a second board screen shows the same board.
const REVEAL_MS = 4000;
const BOARD_STORE = 'cn.board', KEY_STORE = 'cn.key', ROOM_STORE = 'cn.room';
const local = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let words = [], images = null, board = null, built = '', demo = null;
// Which parts this screen brings to a room: the board once it has shown the board, the key once
// it has shown the key. A room missing one of them gets it from the first screen that has it.
const mine = { board: false, key: false };
const pics = { agent: [], agentbg: [], bystander: [], bystanderbg: [], black: [] };
const next = { agent: 0, agentbg: 0, bystander: 0, bystanderbg: 0 };
const pick = type => { const list = pics[type]; if (!list.length) return null; const url = list[next[type] % list.length]; next[type]++; return url; };
const validBoard = b => b && Array.isArray(b.words) && b.words.length === 25 && Array.isArray(b.colors) && b.colors.length === 25;

async function loadImages() {
  try {
    const r = await fetch('images.json', { cache: 'no-cache' });
    images = await r.json();
  } catch { images = {}; }
  for (const type of Object.keys(pics)) pics[type] = shuffle((images[type] || []).map(f => 'img/' + f));
  // Fetch the pictures this board can show (at most 17 agents and 7 bystanders), so they're ready
  // when a card turns and saved for offline play.
  const want = [...pics.agent.slice(0, 17), ...pics.agentbg, ...pics.bystander.slice(0, 7), ...pics.bystanderbg, ...pics.black];
  for (const url of want) new Image().src = url;
}

// Show a card in a colour: with the flip, or at once (instant) when the board is first drawn.
function paint(card, color, instant = false) {
  if (!instant && card.classList.contains('flipping')) { setTimeout(() => paint(card, color), 650); return; }
  clearTimeout(card.revealTimer);
  const apply = () => {
    card.dataset.color = color;
    card.className = card.className.replace(/\bcolor-\d\b/, `color-${color}`);
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

const dealBoard = () => ({ words: shuffle([...words]).slice(0, 25), colors: Array(25).fill(0) });

// Draw the board's cards (only when its words change; colour changes go through paint).
function buildBoard() {
  const el = $('wordBoard');
  el.innerHTML = '';
  board.words.forEach((word, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'cn-cell';
    const card = document.createElement('button');
    card.className = 'cn-card color-0';
    card.dataset.color = '0';
    card.innerHTML = '<div class="bg"></div><div class="fg"></div><div class="tint"></div><span class="word"></span>';
    card.querySelector('.word').textContent = word;
    card.onclick = () => { if (!demo) tap(i, (board.colors[i] + 1) % 5); };
    wrap.appendChild(card);
    el.appendChild(wrap);
    if (board.colors[i]) paint(card, board.colors[i], true);
  });
  built = board.words.join('|');
}
const cardAt = i => $('wordBoard').children[i]?.firstChild;

// A card changed on this screen: show it, save it and tell the room.
function tap(i, color) {
  board.colors[i] = color;
  paint(cardAt(i), color);
  local.set(BOARD_STORE, board);
  renderMarks();
  sendBoard(['colors']);
}

// Demo: every second a random card turns grey, red or blue; the middle card may turn black.
function startDemo() {
  demo = setInterval(() => {
    const i = Math.floor(Math.random() * 25);
    tap(i, i === 12 && Math.random() < .5 ? 4 : 1 + Math.floor(Math.random() * 3));
  }, 1000);
}

function openBoard() {
  if (!board) {
    const saved = local.get(BOARD_STORE);
    board = validBoard(saved) ? saved : dealBoard();
    local.set(BOARD_STORE, board);
  }
  mine.board = true;
  if (built !== board.words.join('|')) buildBoard();
  if (params.has('demo') && !demo) startDemo();
  history.replaceState(null, '', '#board');
  document.body.classList.add('cn-wide');
  show('board'); keepAwake(); startRoom(); fillRoom();
}
function newBoard() {
  if (!confirm(others() ? `Deal a new board? Every screen in room ${roomState.code} gets it.` : 'Deal a new board? This one is cleared.')) return;
  next.agent = next.agentbg = next.bystander = next.bystanderbg = 0;
  for (const type of Object.keys(pics)) shuffle(pics[type]);
  board = dealBoard(); local.set(BOARD_STORE, board);
  buildBoard(); renderMarks();
  sendBoard(['words', 'colors']);
}

// ───────────────────────── SPYMASTER KEY ─────────────────────────
// 9 cards for the team that goes first, 8 for the other, 7 bystanders, 1 assassin.
// The frame's colour says who goes first. Each square matches the board card in the same place;
// once that card has been turned (any colour but tan), the square gets a white dot.
let key = null;
const validKey = k => k && (k.first === 'red' || k.first === 'blue') && Array.isArray(k.cells) && k.cells.length === 25;
function dealKey() {
  const first = Math.random() < .5 ? 'red' : 'blue', second = first === 'red' ? 'blue' : 'red';
  const cells = shuffle([...Array(9).fill(first), ...Array(8).fill(second), ...Array(7).fill('bystander'), 'assassin']);
  return { first, cells };
}
function setKey(k) {
  key = { first: k.first, cells: k.cells };
  local.set(KEY_STORE, key);
  renderKey();
}
function renderKey() {
  if (!key) return;
  $('keyCard').className = `cn-key first-${key.first}`;
  $('keyCard').innerHTML = key.cells.map(c => `<div class="cn-spot ${c}">${c === 'assassin' ? '✕' : ''}</div>`).join('');
  $('keyFirst').className = `cn-first first-${key.first}`;
  $('keyFirst').textContent = `${key.first === 'red' ? 'Red' : 'Blue'} goes first`;
  renderMarks();
}
function renderMarks() {
  const colors = board ? board.colors : [];
  [...$('keyCard').children].forEach((spot, i) => spot.classList.toggle('turned', !!colors[i]));
}

function openKey() {
  if (!key) { const saved = local.get(KEY_STORE); setKey(validKey(saved) ? saved : dealKey()); }
  mine.key = true;
  history.replaceState(null, '', '#spymaster');
  document.body.classList.remove('cn-wide');
  show('key'); keepAwake(); startRoom(); fillRoom();
}
function newKey() {
  if (!confirm(others() ? `Deal a new key card? Every screen in room ${roomState.code} gets it.` : 'Deal a new key card?')) return;
  setKey(dealKey());
  sendKey();
}

// ───────────────────────── ROOM ─────────────────────────
// Every screen, board or spymaster, is in a room (shared/rooms.js shareRoom), shown as a code in
// the top right. A screen starts in a random room of its own, so a game can start straight away.
// Tap the code and type another screen's code to join its room: the room's board and key then show
// on this screen too, and whatever the room lacks (a board, a key) this screen fills in.
// The room holds: words, colors (the board) and first, cells (the key).
// With no internet each screen works on its own.
let room = null, last = null, roomState = { text: 'Connecting…', on: false, count: 0, code: '' };
const others = () => roomState.code && roomState.count > 1;
const send = part => { if (room && room.code && room.code()) room.send(part).catch(() => {}); };
const sendBoard = fields => { if (board) send(Object.fromEntries(fields.map(f => [f, board[f]]))); };
const sendKey = () => { if (key) send({ first: key.first, cells: key.cells }); };
const ownParts = () => ({
  ...(mine.board && board ? { words: board.words, colors: board.colors } : {}),
  ...(mine.key && key ? { first: key.first, cells: key.cells } : {}),
});
// Give the room the parts it doesn't have yet.
function fillRoom() {
  if (!last || !room || !room.code) return;
  if (mine.board && board && !validBoard(last)) sendBoard(['words', 'colors']);
  if (mine.key && key && !validKey(last)) sendKey();
}

function onRoomState(s) {
  last = s;
  if (!s) return;
  if (validBoard(s)) {
    const sameWords = board && board.words.join('|') === s.words.join('|');
    if (!sameWords) board = { words: [...s.words], colors: [...s.colors] };
    else s.colors.forEach((c, i) => { if (board.colors[i] !== c) { board.colors[i] = c; if (built === board.words.join('|')) paint(cardAt(i), c); } });
    local.set(BOARD_STORE, board);
    if (mine.board && built !== board.words.join('|')) buildBoard();
  }
  if (validKey(s) && (!key || key.first !== s.first || key.cells.join() !== s.cells.join())) setKey(s);
  renderMarks();
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
    ...(view === 'board' ? [['New board', newBoard], ...(document.fullscreenEnabled ? [['Full screen', fullScreen]] : []), ['Spymaster key', openKey]] : []),
    ...(view === 'key' ? [['New key', newKey], ['Board', openBoard]] : []),
    ...(view !== 'choose' ? [['Room', openRoomDlg]] : []),
    ...(view !== 'choose' ? [['Change screen', openChoose]] : []),
    ['About', showAbout],
  ];
});

$('btnBoard').onclick = openBoard;
$('btnKey').onclick = openKey;
$('btnNewKey').onclick = newKey;

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
