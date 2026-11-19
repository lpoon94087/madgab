import { $, shuffle, lines, keepAwake, initMenu, initAbout } from '../shared/common.js';

// Codenames: a board for the shared screen and a key card for the spymasters.
// The two aren't linked: like the boxed game, the spymasters' key is dealt on its own, and both
// spymasters share one screen (a second phone would deal a different key).
// Words come from words.txt; ?addon=WORD,WORD adds more. The revealed-card pictures are in img/,
// listed in images.json. ?demo reveals random cards every second, for showing the board off.
const VERSION = '1.0', RELEASED = '2026-11-19';

const params = new URLSearchParams(location.search);
const views = ['choose', 'board', 'key'];
const show = name => views.forEach(s => $(s).classList.toggle('hidden', s !== name));

// ───────────────────────── BOARD ─────────────────────────
// A card's colour: 0 tan (not guessed yet), 1 grey (bystander), 2 red, 3 blue, 4 black (assassin).
// Tapping flips it to the next colour; 4 seconds later a guessed card shows its picture.
const REVEAL_MS = 4000;
let words = [], images = null, dealt = false, demo = null;
const pics = { agent: [], agentbg: [], bystander: [], bystanderbg: [], black: [] };
const next = { agent: 0, agentbg: 0, bystander: 0, bystanderbg: 0 };
const pick = type => { const list = pics[type]; if (!list.length) return null; const url = list[next[type] % list.length]; next[type]++; return url; };

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

function setColor(card, color) {
  if (card.classList.contains('flipping')) return;
  clearTimeout(card.revealTimer);
  card.classList.remove('revealed');
  card.classList.add('flipping');
  setTimeout(() => {
    card.dataset.color = color;
    card.className = card.className.replace(/\bcolor-\d\b/, `color-${color}`);
    const bg = card.querySelector('.bg'), fg = card.querySelector('.fg');
    bg.style.backgroundImage = fg.style.backgroundImage = '';
    if (color === 0) return;
    card.revealTimer = setTimeout(() => {
      const [b, f] = color === 1 ? [pick('bystanderbg'), pick('bystander')]
        : color === 4 ? [null, pics.black[0]]
        : [pick('agentbg'), pick('agent')];
      if (b) bg.style.backgroundImage = `url('${b}')`;
      if (f) fg.style.backgroundImage = `url('${f}')`;
      card.classList.add('revealed');
    }, REVEAL_MS);
  }, 300);
  setTimeout(() => card.classList.remove('flipping'), 600);
}

function dealBoard() {
  const board = $('wordBoard');
  board.innerHTML = '';
  for (const word of shuffle([...words]).slice(0, 25)) {
    const wrap = document.createElement('div');
    wrap.className = 'cn-cell';
    const card = document.createElement('button');
    card.className = 'cn-card color-0';
    card.dataset.color = '0';
    card.innerHTML = '<div class="bg"></div><div class="fg"></div><div class="tint"></div><span class="word"></span>';
    card.querySelector('.word').textContent = word;
    card.onclick = () => { if (!demo) setColor(card, (Number(card.dataset.color) + 1) % 5); };
    wrap.appendChild(card);
    board.appendChild(wrap);
  }
  dealt = true;
}

// Demo: every second a random card turns grey, red or blue; the middle card may turn black.
function startDemo() {
  demo = setInterval(() => {
    const cards = [...document.querySelectorAll('.cn-card')], i = Math.floor(Math.random() * cards.length);
    setColor(cards[i], i === 12 && Math.random() < .5 ? 4 : 1 + Math.floor(Math.random() * 3));
  }, 1000);
}

function openBoard() {
  if (!dealt) dealBoard();
  if (params.has('demo') && !demo) startDemo();
  history.replaceState(null, '', '#board');
  document.body.classList.add('cn-wide');
  show('board'); keepAwake();
}
function newBoard() {
  if (!confirm('Deal a new board? This one is cleared.')) return;
  next.agent = next.agentbg = next.bystander = next.bystanderbg = 0;
  for (const type of Object.keys(pics)) shuffle(pics[type]);
  dealBoard();
}

// ───────────────────────── SPYMASTER KEY ─────────────────────────
// 9 cards for the team that goes first, 8 for the other, 7 bystanders, 1 assassin.
// The frame's colour says who goes first. The key is kept until New key, so a reload doesn't lose it.
const KEY_STORE = 'cn.key';
function dealKey() {
  const first = Math.random() < .5 ? 'red' : 'blue', second = first === 'red' ? 'blue' : 'red';
  const cells = shuffle([...Array(9).fill(first), ...Array(8).fill(second), ...Array(7).fill('bystander'), 'assassin']);
  const key = { first, cells };
  try { localStorage.setItem(KEY_STORE, JSON.stringify(key)); } catch {}
  return key;
}
function savedKey() {
  try { const k = JSON.parse(localStorage.getItem(KEY_STORE)); if (k && k.cells && k.cells.length === 25) return k; } catch {}
  return null;
}
function renderKey(key) {
  $('keyCard').className = `cn-key first-${key.first}`;
  $('keyCard').innerHTML = key.cells.map(c => `<div class="cn-spot ${c}">${c === 'assassin' ? '✕' : ''}</div>`).join('');
  $('keyFirst').className = `cn-first first-${key.first}`;
  $('keyFirst').textContent = `${key.first === 'red' ? 'Red' : 'Blue'} goes first`;
}
function openKey() {
  renderKey(savedKey() || dealKey());
  history.replaceState(null, '', '#spymaster');
  document.body.classList.remove('cn-wide');
  show('key'); keepAwake();
}
function newKey() {
  if (!confirm('Deal a new key card? Only do this for a new board.')) return;
  renderKey(dealKey());
}

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
    ...(view !== 'choose' ? [['Change screen', openChoose]] : []),
    ['About', showAbout],
  ];
}, { leaving: () => $('board').classList.contains('hidden') ? '' : 'Leave the board? Going back deals a new one.' });

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
