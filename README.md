# Exit Strategy 3

A browser-based adaptation of the abstract strategy game **Exit Strategy 3**.

## Play

Open `index.html` locally, or use the GitHub Pages deployment from `main`.

No framework, server, account, or build step is required.

## Game modes

- **Local 1 vs 1** keeps the original secret handoff setup.
- **Vs. CPU1** uses a random legal CPU setup. CPU1 waits at least one second and checks every immediately available opponent reply before choosing a move.
- **Vs. CPU3** uses a scored logical setup and iterative Minimax with alpha-beta pruning. Its search is three plies: CPU move, opponent reply, CPU reply. It thinks for at least one second and no longer than 45 seconds.
- **CPU vs CPU** lets Player 1 and Player 2 independently use CPU1 or CPU3. Matches can be paused, resumed, or advanced one move at a time.

An optional timed mode gives each move a one-minute limit and each player 50 minutes total. The confirmation dialog does not pause the clock. A forced pass consumes one full minute from the passing player's total.

## Rules

Each player has five numbered pawns and one Hunter.

### Victory

A player wins by either:

- getting **two numbered pawns** out through the central exit; or
- using the Hunter to capture **three opposing pawns**.

### Setup

1. The system randomly selects the **choice maker**.
2. The choice maker chooses to play first or second.
3. The first player becomes **Player 1 (cyan)**, sets up first, and later takes the first turn.
4. Player 2 uses **magenta** and sets up second.
5. Both setups are secret until the simultaneous reveal.

Pawns are numbered in their first-placement order. Moving or temporarily returning a pawn to the reserve does not change its number. Restarting the whole placement resets numbering to 1.

### Numbered pawns

A numbered pawn moves horizontally or vertically **as far as possible**. It stops on the last empty square before a wall or any piece. Pawns cannot capture and cannot stop early.

The central exit is intangible. A pawn may cross it without leaving the board. It exits only when the central exit is its forced final square because the next square is blocked by a wall or a piece.

### Hunter

The Hunter moves exactly one square horizontally or vertically. It cannot:

- enter the central exit;
- land on a friendly pawn;
- land on the opposing Hunter.

It captures an opposing pawn by entering that pawn's square.

### Draws

The game is drawn when:

- neither player can move, causing two consecutive forced passes;
- the same full position occurs for the third time;
- 100 turns are completed, giving each player at most 50 turns.

## Board coordinates

The board is based on a 7 × 7 grid. These 12 squares are removed:

`A1`, `E1`, `F1`, `G1`, `G2`, `G3`, `A5`, `A6`, `A7`, `B7`, `C7`, `G7`.

The exit is `D4`.

## Development

```bash
npm test
```

The static site deploys from `main` through the included GitHub Pages workflow.
