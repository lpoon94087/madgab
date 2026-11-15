# Mad Gab

A two-device Mad Gab game: **https://lpoon94087.github.io/madgab/**

- **Proctor** — tap *Proctor*. You get a 4-letter room code and a QR code, pick the round length, Easy or Hard cards, and team names, then *Start round*. You see the puzzle and the answer, and tap **Got It** or **Skip**. After each round, *Next round* passes the turn to the next team.
- **Viewer** — scan the QR code, or tap *Viewer* and type the room code. The team sees only the puzzle, the clock and the scores. Answers appear on the viewer only when the round ends.
- **Menu** — tap *Mad Gab* in the top corner. The proctor gets *New game* (stops any round and sets every team back to 0), *Reshuffle deck* and *Leave game* (the viewer sees that the game ended); a viewer gets *Leave room*; the start page gets *How to play*. Every screen also has *About*, which shows the version and card counts. The version is `VERSION` in `index.html`; bump it when you change the game.
- **Demo** — new to Mad Gab? Tap *Try a demo* on the start page. It shows one example puzzle (*Olive Yew*), reveals the answer (*I Love You*), then explains the two roles. It runs on one device and needs no room code; the example isn't one of the cards.

Devices sync through a Firebase Realtime Database (project `madgab-b4a1e`); its rules are in `database.rules.json` and deploy with `npx firebase-tools deploy --only database`. Cards come from `flashcards.txt` (`puzzle,answer` per line). `hard.txt` lists the puzzles rated hard (one per line); every other card is easy, and the proctor picks Easy, Hard or both before a round. The deck is shuffled once and remembered on the proctor's device, so cards don't repeat until you reshuffle.

To run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
