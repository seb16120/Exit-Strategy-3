# Exit Strategy 3

A browser-based, local two-player adaptation of the abstract strategy game **Exit Strategy 3**.

## Play

Open `index.html` locally, or use the GitHub Pages deployment after the V1 branch is merged into `main`.

No framework, server, account, or build step is required.

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

The site is static and deploys from `main` through the included GitHub Pages workflow.
