import { $, store, lines, keepAwake, initMenu, initAbout, createRounds } from '../shared/common.js';

// Word Generator: words for Charades, Pictionary, Password and the like, on one device.
// The lists are lists/<id>.txt (one word per line), described by lists.json.
// "Just words" hands out one word at a time; timed rounds use the shared round engine.
const VERSION = '1.0', RELEASED = '2026-11-17';

const sections = ['setup', 'free', 'ready', 'play', 'over'];
const show = name => sections.forEach(s => $(s).classList.toggle('hidden', s !== name));
const st = store('wg');

// How to play
const howto = $('howto');
const openHow = () => { howto.classList.remove('hidden'); $('btnHowClose').focus(); };
const closeHow = () => howto.classList.add('hidden');
$('btnHowClose').onclick = closeHow;
howto.addEventListener('click', e => { if (e.target === howto) closeHow(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHow(); });

let G = null, lists = [], cards = [];
const byId = new Map();

// The list picker: every list, plus "all of" options for each family and for everything.
// An option's value is the comma-separated ids it covers.
function buildPicker() {
  const sel = $('optList'), opt = (value, text) => `<option value="${value}">${text}</option>`;
  const families = [...new Set(lists.map(l => l.family).filter(Boolean))];
  let html = `<optgroup label="Mixes">${opt(lists.map(l => l.id).join(','), 'Everything')}`;
  for (const f of families) {
    const ids = lists.filter(l => l.family === f).map(l => l.id);
    if (ids.length > 1) html += opt(ids.join(','), `All ${f}`);
  }
  html += '</optgroup>';
  for (const g of [...new Set(lists.map(l => l.group))])
    html += `<optgroup label="${g}">${lists.filter(l => l.group === g).map(l => opt(l.id, l.name)).join('')}</optgroup>`;
  sel.innerHTML = html;
  const saved = st.get('list', 'pictionary-easy');
  sel.value = [...sel.options].some(o => o.value === saved) ? saved : sel.options[0].value;
}
const chosen = () => new Set($('optList').value.split(','));
const chosenName = () => $('optList').selectedOptions[0].textContent;
// The tip for the chosen lists: shared if they all agree, otherwise a general one.
function chosenTip() {
  const tips = [...new Set([...chosen()].map(id => byId.get(id).tip))];
  return tips.length === 1 ? tips[0] : 'Each word shows what to do with it.';
}
function onListChange() {
  st.set('list', $('optList').value);
  $('listTip').textContent = chosenTip();
  if (G) G.updateDeckInfo();
}

// ───────────── Just words ─────────────
let covered = false;
function freeWord() {
  const c = G.draw();
  $('fWord').textContent = c.word;
  // With a mix, say which list the word came from, so the player knows to draw it or act it.
  $('fTip').textContent = chosen().size > 1 ? `${byId.get(c.list).name} · ${byId.get(c.list).tip}` : chosenTip();
  setCovered($('optCover').checked);
  const left = G.left();
  $('fLeft').textContent = `${left} word${left === 1 ? '' : 's'} left before the list starts over`;
}
function setCovered(on) {
  covered = on;
  $('fWord').style.visibility = on ? 'hidden' : '';
  $('fHint').textContent = on ? 'Tap to see your word' : 'Tap to hide';
}
function startFree() {
  if (!G) return;
  st.set('cover', $('optCover').checked);
  $('fList').textContent = chosenName();
  show('free'); keepAwake(); freeWord();
}
$('fCard').onclick = () => setCovered(!covered);
$('fCard').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCovered(!covered); } };
$('btnFreeNext').onclick = freeWord;
$('btnFreeBack').onclick = () => show('setup');
$('btnFree').onclick = startFree;

// ───────────── Menu / About ─────────────
const showAbout = initAbout({
  version: VERSION, released: RELEASED,
  cardsText: () => `${cards.length.toLocaleString()} words in ${lists.length} lists.`,
});
initMenu(() => [
  ...(G ? [['New game', G.newGame], ['Reshuffle all words', G.reshuffle]] : []),
  ['How to play', openHow],
  ['All games', () => { location.href = '../'; }],
  ['About', showAbout],
]);

// ───────────── Start ─────────────
show('setup');
$('optCover').checked = st.get('cover', true);
try {
  lists = await fetch('lists.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  lists.forEach(l => byId.set(l.id, l));
  const words = await Promise.all(lists.map(l => lines(`lists/${l.id}.txt`)));
  lists.forEach((l, i) => words[i].forEach(word => cards.push({ word, list: l.id })));
  buildPicker();
  G = createRounds({
    prefix: 'wg', cards, show, noun: 'words',
    fits: i => chosen().has(cards[i].list),
    info: chosenName,
    renderCard: c => {
      $('pWord').textContent = c.word;
      $('pList').textContent = chosen().size > 1 ? byId.get(c.list).name : '';
    },
    result: r => [r.word, chosen().size > 1 ? byId.get(r.list).name : ''],
  });
  $('optList').onchange = onListChange;
  onListChange();
} catch {
  $('deckInfo').textContent = 'Could not load the word lists — open this page from a web server, not as a local file.';
  $('btnStart').disabled = $('btnFree').disabled = true;
}
