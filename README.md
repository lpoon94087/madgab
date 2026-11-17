# ULP Games

Party games for phones: **https://lpoon94087.github.io/ulpgames/**

The start page lets you pick a game. Each game lives in its own folder and shares the code in `shared/`.

| Folder | Game | Devices |
| --- | --- | --- |
| `madgab/` | Mad Gab | 2 or more: a proctor and one or more viewers |
| `watch-ya-mouth/` | Watch Ya Mouth | 1, held by the reader |
| `word-generator/` | Word Generator | 1 |

## Mad Gab

- **Proctor** — tap *Proctor*. You get a 4-letter room code and a QR code, pick the round length, Easy or Hard cards, and team names, then *Start game*. You see the puzzle and the answer, and tap **Got It** or **Skip**. After each round, *Next round* shows whose turn it is with a single *Start round* button; the settings only change through *New game*.
- **Viewer** — scan the QR code, or tap *Viewer* and type the room code. The team sees only the puzzle, the clock and the scores. Answers appear on the viewer only when the round ends.
- **Menu** — tap *Mad Gab* in the top corner. The proctor gets *New game* (stops any round and sets every team back to 0), *Reshuffle deck* and *Leave game* (the viewer sees that the game ended); a viewer gets *Leave room*; the start page gets *How to play* and *All games*. Every screen also has *About*, which shows the version and card counts.
- **Demo** — tap *Try a demo* on the start page. It shows one example puzzle (*Olive Yew*), reveals the answer (*I Love You*), then explains the two roles.

Devices sync through a Firebase Realtime Database (project `madgab-b4a1e`); its rules are in `database.rules.json` and deploy with `npx firebase-tools deploy --only database`. Cards come from `madgab/flashcards.txt` (`puzzle,answer` per line). `madgab/hard.txt` lists the puzzles rated hard (one per line); every other card is easy. Old room links (`/?join=CODE`) are forwarded to `madgab/`.

## Watch Ya Mouth

The reader wears a cheek retractor and reads each phrase out loud; their team has to work out what they're saying. One phone, held by the reader: set the round length and teams, *Start game*, then **Got It** or **Skip** for each phrase. Between rounds the phone goes to the next team's reader. Phrases come from `watch-ya-mouth/phrases.txt`, one per line.

## Word Generator

Words for Charades, Pictionary, Password, describe-it games and anything else. Pick a list (or a mix such as *All Pictionary* or *Everything*), then either:

- **Just words** — tap *Next word* whenever you need one. Each new word is covered until tapped (a setup option), so only the player holding the phone sees it. In a mix, each word says which list it came from and what to do with it.
- **Timed rounds** — the same teams, clock, Got It / Skip and results as the other games.

Words don't repeat until the chosen lists run out. The lists are `word-generator/lists/<id>.txt`, one word per line; `word-generator/lists.json` gives each its name, its group in the picker (*Games* or *Topics*), its family (lists in the same family get an *All …* mix) and the tip shown with it. To add a list, add a file and an entry. All the lists were written for this site.

## Code

- `shared/common.js` — the round engine (`createRounds`: teams, scores, a shuffled deck saved on the device so cards don't repeat until you reshuffle, the clock, Got It / Skip, results), plus the menu, the About box, beeps and the screen wake lock.
- `shared/style.css` — styles for every page.
- `<game>/index.html` and `<game>/<game>.js` — the game's screens and whatever is specific to it (Mad Gab's rooms and viewer, its demo, its Easy/Hard filter).

To add a game: make a folder with an `index.html` containing the `setup`, `ready`, `play` and `over` sections (see the element ids listed above `createRounds`), call `createRounds` with its cards, and add a card for it to the root `index.html`. Each game has its own `VERSION` in its JS file; bump it when you change the game.

To run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
