# Individually illustrated directory icons — art package 1.0.1

All 37 games now use individually illustrated gameplay-specific directory icons. The five imagegen output sheets use one consistent cream/gold frame, midnight navy background and warm 3D material style. This supersedes the previous shared gameplay sprite plus corner-mark directory scheme. The actual gameplay artwork remains separately documented in `../premium-game-art-v1/README.md`.

## Production integration

- `standalone/game-icons.js` exports `GAME_ICON_ART_VERSION`, all 37 `GAME_ICON_ART_V2` mappings, and `gameArtworkIconV2HTML(id)`.
- The existing public `gameArtworkIconHTML` export at the end of `standalone/game-art.js` delegates to this new renderer. The concurrent bubble cache/helper implementation was retained.
- `standalone/game-art.css` consumes the explicit source-image, source-size and source-position variables and retains the `.wb-game-icon` catalog hook. Every icon is decorative beneath its adjacent game title, with `aria-hidden="true"`. Unknown game IDs return an empty fallback request.
- `assets/game-art/icons-v2/manifest.json` records all source rectangles, sheet dimensions, byte sizes, SHA-256 hashes and per-game subjects. All 37 per-game art manifests declare their precise directory icon and source atlas and use `artVersion` / `sharedArtVersion` `1.0.1`.
- The five original PNGs are under `assets/game-art/icons-v2/`, total 9,769,333 bytes. Each original sheet is 1254 × 1254 px. The image generator did not preserve exact row thirds, so the renderer uses verified explicit rectangles. It never renders an entire nine-icon sheet as one game icon. Source images were copied unchanged from the built-in generator; no Python image editing or external generation API was used.
- Formal generation prompts, including the first sheet's targeted border correction, are in `prompts/`. The first sheet was used only as a visual style reference for the later sheets.

## Observed verification

- `all-48-size-check.png` and `all-72-size-check.png`: all 37 icons displayed and visually inspected at actual CSS sizes; each complete icon remains independent with no neighboring frame bleed. Per-sheet images also show 112 px previews.
- `home-single-integrated.png` and `home-double-integrated.png`: real local application homepage with the new icon renderer, not a catalog mockup.
- `integration-result.json`: 23 single-player + 14 computer-opponent actual catalog cards have the correct per-game icon and atlas URL; old corner badges are absent; all icon boxes have positive dimensions; clicking the real Match3 card opens the game. Zero JavaScript exceptions and zero external requests.
- `metadata-result.json`: all 37 IDs, version fields, source bounds, manifests and asset references match; unknown and prototype-key IDs are rejected safely. JavaScript syntax checks passed.
- `bubbles-24-48.png` and `bubble-result.json`: read-only rendering of the root task's current bubble helper at 24/48 px against light/dark backgrounds. Six colors have complete visible round silhouettes and no rectangular background; every sampled corner alpha is zero. The root's sphere atlas, clipping and cache code were not changed by this icon task. The Paopao manifest now declares the new bubble atlas.
- The one-line Blackjack player-name/score contrast correction is now included in the production stylesheet and freshly verified in `blackjack-contrast-integrated.png`. The prior deferred patch in the v1 evidence archive remains a historical candidate record; this release no longer leaves it deferred.

Browser evidence was captured in an isolated local Chrome profile on CDP 9356 against HTTP 8876. It does not substitute for the root task's final native Android and signed update validation.

## Per-game icon identity

| Game ID | New illustrated subject | Source sheet / cell |
|---|---|---|
| tetris | Falling tetromino blocks | sheet-01 / 0 |
| snake | Emerald S snake and apple | sheet-01 / 1 |
| game2048 | Large engraved 2048 tile | sheet-01 / 2 |
| watermelon | Juicy watermelon merging fruit | sheet-01 / 3 |
| memory | Matching strawberry playing tiles | sheet-01 / 4 |
| jump | Fox leaping between platforms | sheet-01 / 5 |
| plank | Fox walking across wood bridge | sheet-01 / 6 |
| sudoku | Ivory numbered Sudoku grid | sheet-01 / 7 |
| minesweeper | Black mine and red grid flag | sheet-01 / 8 |
| uyangle | Triple matched tiles and sheep | sheet-02 / 0 |
| screw | Crossed metal strips and lifted screw | sheet-02 / 1 |
| popstar | Colorful popping star blocks | sheet-02 / 2 |
| paopao | Gold bubble cannon and color arc | sheet-02 / 3 |
| game1010 | Inset block-placement board | sheet-02 / 4 |
| turkey | Red sliding block and right exit | sheet-02 / 5 |
| spider | Spade card cascades and gold spider | sheet-02 / 6 |
| linklink | Paired orange tiles with elbow link | sheet-02 / 7 |
| shuerte | Searching number tiles with path | sheet-02 / 8 |
| pinball | Pinball flippers steel ball bumpers | sheet-03 / 0 |
| match3 | Three matching red heart gems | sheet-03 / 1 |
| freecell | Four free card slots and suited fan | sheet-03 / 2 |
| zuma | Carved jade frog and marble chain | sheet-03 / 3 |
| watersort | Layered glass tubes pouring colors | sheet-03 / 4 |
| ludo | Red blue planes on Ludo route | sheet-03 / 5 |
| guessnumber | Four number lock wheels and lens | sheet-03 / 6 |
| wordguess | Letter and question speech bubbles | sheet-03 / 7 |
| tictactoe | Red X and teal O grid | sheet-03 / 8 |
| gomoku | Five black stones in one line | sheet-04 / 0 |
| territory | Dots edges and claimed square | sheet-04 / 1 |
| oldmaid | Jester and matching heart cards | sheet-04 / 2 |
| reversi | Black white disks with flipping piece | sheet-04 / 3 |
| bombnumber | Fuse bomb and numeric 50 tile | sheet-04 / 4 |
| connect4d | Upright colored disk connection rack | sheet-04 / 5 |
| draughts | Six-pointed star Chinese checkers board | sheet-04 / 6 |
| blackjack | Spade ace heart king casino chips | sheet-04 / 7 |
| westernchess | Ivory king and black knight board | sheet-04 / 8 |
| chinesechess | Red 帅 and black 将 Xiangqi disks | sheet-05 / 0 |
