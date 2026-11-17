// Shared by every game: small helpers, the menu, the About box, and the round engine
// (teams, scores, a persistent shuffled deck, the clock, Got It / Skip, results).
// A game page supplies its cards and a few hooks; see createRounds() below.

export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// localStorage under a per-game prefix ("mg.time", "wym.deck", …), tolerant of blocked storage.
export function store(prefix) {
  return {
    get(k, d) { try { const v = localStorage.getItem(prefix + '.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(prefix + '.' + k, JSON.stringify(v)); } catch {} },
  };
}

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Fetch a text file and return its non-empty lines.
export async function lines(file) {
  const r = await fetch(file, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  return (await r.text()).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

// Keep the screen awake while a game is running.
let wakeLock = null, wantAwake = false;
export async function keepAwake() {
  wantAwake = true;
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wantAwake) keepAwake(); });

// Short beeps for the last seconds and the buzzer.
let audio = null;
export function beep(freq = 880, dur = 0.12, vol = 0.2) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + dur);
  } catch {}
}

// ───────────────────────── MENU ─────────────────────────
// Tapping the game's name (#btnMenu) opens #menu. items() returns [label, fn, className?][]
// and is called each time, so the menu can depend on what the page is doing.
export function initMenu(items) {
  const btn = $('btnMenu'), m = $('menu');
  const close = () => { m.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
  btn.onclick = e => {
    e.stopPropagation();
    if (!m.classList.contains('hidden')) return close();
    m.innerHTML = '';
    for (const [label, fn, cls] of items()) {
      const b = document.createElement('button');
      b.textContent = label; b.setAttribute('role', 'menuitem'); if (cls) b.className = cls;
      b.onclick = () => { close(); fn(); };
      m.appendChild(b);
    }
    m.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true');
  };
  document.addEventListener('click', e => { if (!m.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// ───────────────────────── ABOUT ─────────────────────────
// The #about overlay. cardsText() may be async; it fills #aboutCards.
export function initAbout({ version, released, cardsText }) {
  const box = $('about');
  const close = () => box.classList.add('hidden');
  $('btnAboutClose').onclick = close;
  box.addEventListener('click', e => { if (e.target === box) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return async function open() {
    $('aboutVersion').textContent = `Version ${version} · ${released}`;
    box.classList.remove('hidden'); $('btnAboutClose').focus();
    try { $('aboutCards').textContent = cardsText ? await cardsText() : ''; } catch { $('aboutCards').textContent = ''; }
  };
}

// ───────────────────────── ROUNDS ─────────────────────────
// The moderator's side of a timed, team-based card game. The page must contain these ids:
//   setup:  optTime, optTeams, deckInfo, btnStart
//   ready:  rScores, rBanner, rInfo, btnStartNext
//   play:   pScores, pClock, btnSkip, btnGot, btnPause, btnEnd   (+ elements with class "hide-on-pause")
//   over:   oScores, oBanner, oResults, btnNext
// Options:
//   prefix      storage prefix ('mg', 'wym')
//   cards       array of card objects
//   show(name)  switch the page to section 'setup' | 'ready' | 'play' | 'over'
//   renderCard(card)  put the current card on the play screen
//   result(r)   [main, sub] text for a card in the results list (r is the card plus .got)
//   fits(i)     optional: whether card i can be drawn under the current settings
//   deckName()  optional: word before "cards" in the deck count ('easy', …)
//   noun        optional: what the deck count calls a card ('words'); default 'cards'
//   info()      optional: extra item for the line under "you're up"
//   readyText(team)  optional: banner between rounds
//   onChange(G) optional: called after every change (Mad Gab syncs its viewers here)
export function createRounds(o) {
  const st = store(o.prefix);
  const cards = o.cards, fits = o.fits || (() => true);
  const G = { teams: [], current: 0, roundMs: 120000, phase: 'setup', endsAt: 0, pausedLeft: 0, card: null, results: [], deck: [] };
  let tick = null, lastBeep = -1;
  const changed = () => { if (o.onChange) o.onChange(G); };

  // Teams and scores
  function parseTeams() {
    const names = $('optTeams').value.split(',').map(s => s.trim()).filter(Boolean);
    return (names.length ? names : ['Team A']).map(name => ({ name, score: 0 }));
  }
  function syncTeams() {
    const old = new Map(G.teams.map(t => [t.name, t.score]));
    G.teams = parseTeams().map(t => ({ name: t.name, score: old.get(t.name) || 0 }));
    if (G.current >= G.teams.length) G.current = 0;
    st.set('teamsText', $('optTeams').value);
    saveScores();
  }
  function saveScores() { st.set('teams', G.teams); st.set('current', G.current); }
  function renderScores() {
    const html = G.teams.map((t, i) =>
      `<div class="team ${i === G.current ? 'current' : ''}">${esc(t.name)}<b>${t.score}</b></div>`).join('');
    ['pScores', 'oScores', 'rScores'].forEach(id => $(id).innerHTML = html);
  }

  // Deck: a shuffled order of card indexes, saved so cards don't repeat across sessions.
  // It holds every card; fits() picks which ones get drawn.
  function loadDeck() {
    const saved = st.get('deck', null);
    if (saved && saved.n === cards.length && Array.isArray(saved.order)) G.deck = saved.order;
    else reshuffle();
  }
  function reshuffle() { G.deck = shuffle(cards.map((_, i) => i)); saveDeck(); updateDeckInfo(); }
  function saveDeck() { st.set('deck', { n: cards.length, order: G.deck }); }
  function drawCard() {
    let at = G.deck.findIndex(fits);
    if (at < 0) {   // this selection is used up: put its cards back, shuffled, without touching the others
      G.deck = G.deck.concat(shuffle(cards.map((_, i) => i).filter(fits)));
      at = G.deck.findIndex(fits);
    }
    const card = cards[G.deck.splice(at, 1)[0]]; saveDeck(); return card;
  }
  // The card on screen when a round ends has been seen, so it never goes back in the deck
  // (the next team would start with it). endRound lists it as missed; stop() just drops it.
  function discard() { G.card = null; }
  function updateDeckInfo() {
    const left = G.deck.filter(fits).length, total = cards.filter((_, i) => fits(i)).length;
    const name = o.deckName ? o.deckName() : '';
    $('deckInfo').textContent = `${left} of ${total} ${name ? name + ' ' : ''}${o.noun || 'cards'} left in the deck.`;
    $('rInfo').textContent = [`${fmt(Number($('optTime').value) * 1000)} round`, o.info && o.info(), `${left} left`].filter(Boolean).join(' · ');
  }

  // Rounds
  function setPaused(p) { document.querySelectorAll('.hide-on-pause').forEach(el => el.style.visibility = p ? 'hidden' : ''); }
  function startRound() {
    syncTeams();
    G.roundMs = Number($('optTime').value) * 1000;
    st.set('time', G.roundMs / 1000);
    G.results = []; G.card = drawCard(); G.phase = 'playing';
    G.endsAt = Date.now() + G.roundMs; lastBeep = -1;
    $('pClock').textContent = fmt(G.roundMs); $('pClock').classList.remove('low');
    $('btnPause').textContent = 'Pause'; setPaused(false);
    o.show('play'); renderScores(); o.renderCard(G.card); keepAwake(); beep(660, .15);
    clearInterval(tick); tick = setInterval(onTick, 250);
    changed();
  }
  function onTick() {
    if (G.phase !== 'playing') return;
    const left = G.endsAt - Date.now();
    $('pClock').textContent = fmt(left);
    $('pClock').classList.toggle('low', left <= 10000);
    const sec = Math.ceil(left / 1000);
    if (sec <= 5 && sec > 0 && sec !== lastBeep) { lastBeep = sec; beep(880, .08, .12); }
    if (left <= 0) endRound();
  }
  function answer(got) {
    if (G.phase !== 'playing') return;
    G.results.push({ ...G.card, got });
    if (got) { G.teams[G.current].score++; saveScores(); renderScores(); beep(1046, .1); }
    G.card = drawCard(); o.renderCard(G.card); updateDeckInfo(); changed();
  }
  function togglePause() {
    if (G.phase === 'playing') {
      G.pausedLeft = G.endsAt - Date.now(); G.phase = 'paused';
      $('btnPause').textContent = 'Resume'; setPaused(true);
    } else if (G.phase === 'paused') {
      G.endsAt = Date.now() + G.pausedLeft; G.phase = 'playing';
      $('btnPause').textContent = 'Pause'; setPaused(false);
    }
    changed();
  }
  function endRound() {
    clearInterval(tick);
    if (G.card) G.results.push({ ...G.card, got: false });
    discard(); G.phase = 'over'; setPaused(false);
    beep(220, .6, .3);
    const got = G.results.filter(r => r.got).length;
    $('oBanner').textContent = `${G.teams[G.current].name}: ${got} point${got === 1 ? '' : 's'} this round`;
    $('oResults').innerHTML = G.results.length ? G.results.map(r => {
      const [main, sub] = o.result(r);
      return `<li class="${r.got ? 'got' : 'skip'}"><span class="mark">${r.got ? '✓' : '✗'}</span>
        <span><div>${esc(main)}</div>${sub ? `<div class="p">${esc(sub)}</div>` : ''}</span></li>`;
    }).join('') : '<li class="muted">No cards this round.</li>';
    renderScores(); o.show('over'); changed();
  }
  function nextRound() {
    G.current = (G.current + 1) % G.teams.length; saveScores();
    G.phase = 'setup'; updateDeckInfo(); renderScores();
    const team = G.teams[G.current].name;
    $('rBanner').textContent = o.readyText ? o.readyText(team) : `${team}, you're up`;
    o.show('ready'); changed();
  }
  // New game: stop any round, every score back to 0, first team up, back to setup.
  // The deck carries on; reshuffle puts every card back.
  function newGame() {
    if (!confirm('Start a new game? Any round in progress stops, and every team goes back to 0.')) return;
    stop(); syncTeams(); G.teams.forEach(t => t.score = 0); G.current = 0; saveScores();
    G.phase = 'setup'; G.results = []; updateDeckInfo(); renderScores(); o.show('setup'); changed();
  }
  function stop() { clearInterval(tick); discard(); setPaused(false); }

  // Wire up the shared controls.
  $('optTime').value = String(st.get('time', 120));
  $('optTeams').value = st.get('teamsText', 'Team A, Team B');
  G.teams = st.get('teams', null) || parseTeams();
  G.current = st.get('current', 0) % G.teams.length;
  $('btnStart').onclick = startRound;
  $('btnStartNext').onclick = startRound;
  $('btnGot').onclick = () => answer(true);
  $('btnSkip').onclick = () => answer(false);
  $('btnPause').onclick = togglePause;
  $('btnEnd').onclick = () => { if (confirm('End this round now?')) endRound(); };
  $('btnNext').onclick = nextRound;
  $('optTeams').onchange = () => { syncTeams(); renderScores(); changed(); };
  $('optTime').onchange = updateDeckInfo;
  loadDeck(); updateDeckInfo(); renderScores();

  return Object.assign(G, {
    newGame, stop, updateDeckInfo,
    // Draw outside a timed round (the word generator's free play). Uses the same saved deck.
    draw: () => { const c = drawCard(); updateDeckInfo(); return c; },
    left: () => G.deck.filter(fits).length,
    reshuffle: () => { if (confirm('Reshuffle all cards back into the deck?')) reshuffle(); },
  });
}
