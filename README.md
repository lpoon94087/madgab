# ULP Games

Party games for phones: **https://lpoon94087.github.io/ulpgames/**

The start page lets you pick a game. Each game lives in its own folder and shares the code in `shared/`.

| Folder | Game | Devices |
| --- | --- | --- |
| `madgab/` | Mad Gab | 2 or more: a moderator and one or more viewers |
| `watch-ya-mouth/` | Watch Ya Mouth | 1, held by the reader |
| `password/` | Password | 1, or a moderator plus clue-giver and scoreboard screens |
| `word-generator/` | Word Generator | 1, or a moderator plus any number of viewers |
| `codenames/` | Codenames | 2: the board on a big screen, the spymaster key on a phone |

## Mad Gab

- **Moderator** — tap *Moderator*. You get a 4-letter room code and a QR code, pick the round length, Easy or Hard cards, and team names, then *Start game*. You see the puzzle and the answer, and tap **Got It** or **Skip**. After each round, *Next round* shows whose turn it is with a single *Start round* button; the settings only change through *New game*.
- **Viewer** — scan the QR code, or tap *Viewer* and type the room code. The team sees only the puzzle, the clock and the scores. Answers appear on the viewer only when the round ends.
- **Menu** — tap *Mad Gab* in the top corner. The moderator gets *New game* (stops any round and sets every team back to 0), *Reshuffle deck* and *Leave game* (the viewer sees that the game ended); a viewer gets *Leave room*; the start page gets *How to play*. Every screen also has *Home*, back to the ULP Games start page (it asks first if a game is running), and *About*, which shows the version and card counts. The ULP Games start page has its own menu with *Reload*, which fetches the latest version: handy in a web app saved to a phone's home screen, which has no refresh button.
- **Demo** — tap *Try a demo* on the start page. It shows one example puzzle (*Olive Yew*), reveals the answer (*I Love You*), then explains the two roles.

Devices sync through rooms in a Firebase Realtime Database (project `madgab-b4a1e`); its rules are in `database.rules.json` and deploy with `npx firebase-tools deploy --only database`. Cards come from `madgab/flashcards.txt`, one per line as `puzzle,answer[,easy|hard]`. The level is optional and defaults to hard; answers may contain commas. Old room links (`/?join=CODE`) are forwarded to `madgab/`.

## Watch Ya Mouth

The reader wears a cheek retractor and reads each phrase out loud; their team has to work out what they're saying. One phone, held by the reader: set the round length and teams, *Start game*, then **Got It** or **Skip** for each phrase. Between rounds the phone goes to the next team's reader. Phrases come from `watch-ya-mouth/phrases.txt`, one per line.

## Password

Two teams of two. Both clue-givers see the secret word; the team shown as **guessing** gets a one-word clue and one guess. Wrong passes the next clue to the other team, and after 10 clues nobody scores the word. Teams take turns giving the first clue on each word. Two kinds of scoring:

- **Classic** — a word is worth 10, less one for every wrong guess; first to the target score (15–40, default 25) wins.
- **Simple** — every right answer is 1 point. Play 5, 10, 15 or 20 rounds; in each round both teams start one word, so it's even. Most points wins, and it can end in a tie. Skipped words don't count toward the rounds.

- **Moderator** — the room code and QR code, team names and target, then each word with its value and whose turn it is. *Got it* scores the word for the guessing team, *Wrong* takes a point off and switches teams, *Skip word* draws another, and *Undo* reverses the last tap. The game is saved, so a reload carries on.
- **Clue giver** — a read-only copy of the moderator's screen, word included, for the second clue-giver.
- **Scoreboard** — for the guessers: the points, the scores and a large banner in the guessing team's colour, never the word. Each screen in a room gets the same data; the scoreboard just doesn't show the word.
- The QR code opens a choice between Clue giver and Scoreboard, so a guesser who scans it doesn't see the word by accident.

Words come from `password/words.txt`: every one-word entry in the Word Generator's lists except movie titles.

## Word Generator

Words for Charades, Pictionary, describe-it games and anything else. Choose *Moderator*, tick the lists you want (any mix, such as *Pictionary: Easy* + *Animals* + *Food*; each family has an *All* toggle and there's *Everything*), then either:

- **Just words** — tap *Next word* whenever you need one. Each new word is covered until tapped (a setup option), so only the player holding the phone sees it. In a mix, each word says which list it came from and what to do with it.
- **Timed rounds** — the same teams, clock, Got It / Skip and results as the other games.
- **Moderator or Viewer** — like Mad Gab, the Word Generator opens on a choice: Moderator, Viewer or Scoreboard. The **Moderator** has every control and works fine as the only device; its setup screen shows a room code and QR code. A **Viewer** (scan the code, or tap *Viewer* and type it) shows the current word and its list, plus the clock, scores and results in timed rounds, and can't change anything. Viewers show the word even when it's covered on the moderator. *Leave game* in the moderator's menu ends the game on the viewers. A **Scoreboard** joins the same way but never shows the word: it shows a large clock and the scores, and after each round the words got and missed, so it can face the guessing team.

Words don't repeat until the chosen lists run out. The lists are `word-generator/lists/<id>.txt`, one word per line; `word-generator/lists.json` gives each its name, its group in the picker (*Games* or *Topics*), its family (lists in the same family are shown together under one heading with an *All* toggle; lists with no family go under their group) and the tip shown with it. To add a list, add a file and an entry. The lists were written for this site; the Pictionary and Charades lists also include words picked from the 12dicts word list (2of12), filtered to ones people know and can draw or act out. *Pictionary: Phrases* and *Charades: Phrases* hold two- to five-word phrases (things to draw, and actions such as "walking the dog") that aren't in any other list.

## Codenames

Opens on a choice between **Board** and **Spymaster**.

- **Board** — for a TV or big screen. 25 words dealt from `codenames/words.txt` (one per line). Tap a card to cycle tan → grey (bystander) → red → blue → black (assassin); a few seconds after a card turns, it shows a picture from `codenames/img/` (listed in `codenames/images.json`). Reloading deals a new board, and so does *New board* in the menu. `?addon=WORD,WORD` adds words to the pool; `?demo` turns random cards every second.
- **Spymaster** — the secret key card: a 5×5 grid with 9 cards for the team that goes first, 8 for the other team, 7 bystanders and 1 assassin (✕). The frame is red or blue for the team that goes first. Both spymasters share one screen, since another device would deal a different key. The key is kept on the device until *New key*, so a reload doesn't lose it.

The board and the key aren't linked: the spymasters say which cards to turn, as with the boxed game's key cards. The board came from the stand-alone codenames repo, with its default picture set.

## Offline

After one visit with internet, every game works on one device with no connection: `sw.js` (a service worker) keeps a copy of the whole site, including the Firebase and QR code libraries. Rooms still need internet, so offline the moderator's room panel says *Offline* and a viewer waits until the device is back online. Pages come from the saved copy at once and are refreshed in the background, so a change shows on the next visit; the start page's *Reload* gets it right away.

`sw.js` lists every file it saves and a version made from their contents. `tools/stamp-sw.py` rewrites both; run it before committing (the local pre-commit hook in `.git/hooks/pre-commit` does it and stages `sw.js`). A new file the site serves is picked up as long as it is under `shared/` or a game's folder. Codenames' pictures are left out of the list (they're large) and are saved the first time a board shows them.

## Code

- `shared/common.js` — the round engine (`createRounds`: teams, scores, a shuffled deck saved on the device so cards don't repeat until you reshuffle, the clock, Got It / Skip, results), plus the menu, the About box, beeps and the screen wake lock.
- `shared/rooms.js` — rooms for games with viewers (Mad Gab, Word Generator): the moderator claims a 4-letter code and sends what viewers should see; the viewer screen joins and shows it read-only. Each room is tagged with its game, so a code from one game can't be joined from another.
- `shared/style.css` — styles for every page.
- `<game>/index.html` and `<game>/<game>.js` — the game's screens and whatever is specific to it (Mad Gab's rooms and viewer, its demo, its Easy/Hard filter).

To add a game: make a folder with an `index.html` containing the `setup`, `ready`, `play` and `over` sections (see the element ids listed above `createRounds`), call `createRounds` with its cards, and add a card for it to the root `index.html`. Each game has its own `VERSION` in its JS file; bump it when you change the game.

To run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
