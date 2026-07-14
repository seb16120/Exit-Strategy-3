# Exit Strategy 3

A browser-based adaptation of the abstract strategy game **Exit Strategy 3**.

## Play

Open `index.html` locally, or use the GitHub Pages deployment from `main`.
No framework, server, account, or build step is required.

## Game modes

- **Local 1 vs 1** uses private handoffs for both secret setups.
- **Vs. CPU1** uses a random legal setup and checks every immediate opponent reply.
- **Vs. CPU3** uses a logical setup and an iterative, alpha-beta minimax search capped at three plies and 45 seconds.
- **Vs. CPU+** uses iterative deepening beyond depth three. Except when only one legal move exists or a move wins immediately, it thinks for at least 30 seconds and at most 55 seconds.
- **CPU vs CPU** lets each color independently use CPU1, CPU3, or CPU+, with pause and single-move controls.

## CPU+ placement learning

CPU+ receives about six seconds for its secret setup: the CPU3 logical evaluation plus five seconds of additional comparisons against hypothetical legal opponent formations.

Placement outcomes are stored only in the current browser. The placement key:

- ignores pawn numbering;
- rotates magenta formations by 180 degrees for color normalization;
- keeps first-player and second-player results separate.

Results are weighted by opponent strength:

- CPU+: `100%`;
- CPU3: `66%`;
- CPU1: `50%`;
- local human: starts at `80%`, rises toward `100%` when CPU+ struggles, and falls toward `60%` when CPU+ dominates.

A CPU+ loss on time is excluded from placement learning. A protected reset is available in the options; only a SHA-256 password fingerprint is stored in the repository.

### Trained starter profile

A ready-to-import CPU+ profile is available with **14 learned placements and 45 recorded results**:

[Download the trained CPU+ starter profile](downloads/cpuplus-trained-profile-2026-07-14.json)

In the game, use **Restore backup** to import it, then choose **Merge** to add it to existing learning or **Replace** to use it alone. The same download is also available from the **CPU+ data** controls in the game.

## Timed games

The optional timed mode gives each move one minute and each player 50 minutes total. The confirmation dialog does not stop the clock. A forced pass immediately consumes one minute from the passing player's total.

## Abandoning

- **I was going to lose** awards the opponent the win and may feed CPU+ learning.
- **I have to leave** interrupts the game without recording a result.

## Rules

Each player has five numbered pawns and one Hunter.

A player wins by either:

- getting two numbered pawns out through the central exit; or
- using the Hunter to capture three opposing pawns.

A numbered pawn moves horizontally or vertically as far as possible. It cannot stop early or capture. The central exit is intangible while crossing it; a pawn exits only when the exit is its forced final square.

The Hunter moves exactly one square horizontally or vertically. It cannot enter the exit, land on a friendly pawn, or land on the opposing Hunter. It captures an opposing pawn by entering its square.

The game is drawn after two consecutive forced passes, the third occurrence of the same position, or 100 turns.

## Development

```bash
npm test
```

The site is static and deploys from `main` through GitHub Pages.
