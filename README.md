# Mad Gab

A two-device Mad Gab game: **https://lpoon94087.github.io/madgab/**

- **Proctor** — tap *Proctor*. You get a 4-letter room code and a QR code, pick the round length and team names, then *Start round*. You see the puzzle and the answer, and tap **Got It** or **Skip**.
- **Viewer** — scan the QR code, or tap *Viewer* and type the room code. The team sees only the puzzle, the clock and the scores. Answers appear on the viewer only when the round ends.

Devices sync through a Firebase Realtime Database (project `madgab-b4a1e`); its rules are in `database.rules.json` and deploy with `npx firebase-tools deploy --only database`. Cards come from `flashcards.txt` (`puzzle,answer` per line). The deck is shuffled once and remembered on the proctor's device, so cards don't repeat until you reshuffle.

To run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
