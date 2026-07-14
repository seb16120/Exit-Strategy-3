# Exit Strategy 3

A browser-based adaptation of the abstract strategy game **Exit Strategy 3**.

## Play

Open `index.html` locally, or use the GitHub Pages deployment from `main`.
No framework, server, account, or build step is required.

## Game modes

- **Local 1 vs 1** uses private handoffs for both secret setups.
- **Vs. CPU1** uses a random legal setup and checks every immediate opponent reply.
- **Vs. CPU3** uses a logical setup and an iterative, alpha-beta minimax search capped at three plies and 45 seconds.
- **Vs. CPU+** uses iterative deepening. In timed games it searches for 30 to 55 seconds. Without a clock it targets at least depth 12 and 90 seconds, then stops after the same first move remains best for three completed depths; depth 20 and five minutes are absolute limits.
- **CPU vs CPU** lets each color independently use CPU1, CPU3, or CPU+, with pause and single-move controls.

## CPU+ placement learning

CPU+ considers all **1,716 legal starting formations**, separately for first and second player. Tried formations are ranked from weighted results and a conservative confidence score. The tried formation at rank `r` receives a base probability of `10% / r`, while all untried formations equally share the remaining probability. Once every formation has been tried, the ranked weights are normalized to 100%.

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

A ready-to-import CPU+ profile is available with **14 learned placements and 47 recorded results**:

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
- capturing three opposing numbered pawns with the Hunter.

The game is drawn after two consecutive forced passes, the third occurrence of the same position, or 100 total turns.
