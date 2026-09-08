# Premium game artwork v1 — actual integration and visual evidence

The four imagegen atlases are applied to real gameplay surfaces in all 37 games. This is a shared art refresh, not a claim that every existing vector scene, UI control, or native Space Cadet bitmap was replaced.

- Runtime helper: `standalone/game-art.js`; stylesheet: `standalone/game-art.css`.
- Every game declares its actual asset references and surfaces in `assets/game-art/<gameId>/manifest.json`.
- Initial atlas preload is awaited by standalone startup. Canvas drawing safely falls back to existing rendering if an atlas does not load.
- Stored game IDs, pair identities, boards, physics, move rules and scoring are unchanged. Match3 keeps numeric color identities and updates the visible shape names to match its new artwork.
- Sprite cells trim transparent margins. Circular bubble clipping prevents tall neighboring bomb-fuse pixels from entering a bubble sprite.
- Directory artwork uses `gameArtworkIconHTML(id)`, generated sprites and readable numeric/chess marks; existing `.wb-game-icon` remains the hook.

## Verification

Two complete runs opened, paused and saved every game plus endless Gomoku, with 0 JavaScript exceptions and 0 external resource requests in isolated Chrome (CDP 9356, local HTTP 8876). Every game had actual visible material-backed elements or a successful atlas draw. The automated result is `result.json`; all 37 started-state screenshots and four contact sheets are included here.

26 targeted engine tests passed: `game-engines.test.mjs`, `freecell.test.mjs`, `space-cadet.test.mjs`, `match3.test.mjs`. JavaScript syntax checks passed for the changed renderer modules.

Additional `*-detail.png` images exercise face-up Memory, seeded Watermelon fruit pile, Match3, bubble sprites, numbered Ludo planes, Blackjack after dealing, and Gomoku after a move. Watermelon uses an explicitly seeded disposable test save to show all nine evolution sprites; no user device or user profile was touched. The seed and test scripts are retained under `.local/qa-game-art/`.

I visually inspected every game through `contact-1.png` to `contact-4.png` and individually inspected Match3, Paopao, Watermelon, Memory, Ludo, FreeCell, Zuma, Western Chess, Chinese Chess, Draughts, dealt Blackjack, played Gomoku and both actual home directories. The first Watermelon detail image captured its real resume countdown; it was replaced only after waiting for that countdown to finish. The first bubble images exposed neighboring sprite bleed; `paopao-detail.png` records the corrected draw.

## Per-game scope

| Game ID | Applied new raster artwork | Presentation retained |
|---|---|---|
| blackjack | Green baize card table; Porcelain card faces; Navy velvet backs | Ranks, suits and point values preserved |
| bombnumber | Porcelain selectable number cells | Danger ranges and chosen-state text preserved |
| chinesechess | Maple board; Porcelain lettered pieces | Chinese piece characters, river and grid lines preserved |
| connect4d | Green baize board surround; Red and sapphire blue disks including falling pieces | Board holes, targets and animation preserved |
| draughts | Maple board; Red and sapphire blue disks | Star-board zones and legal destinations preserved |
| freecell | Green baize tableau; Porcelain card faces | Ranks, suits and safe-home indicators preserved |
| game1010 | Porcelain grain clipped to all draggable and placed blocks | Original eight colors, block shapes and grid preserved |
| game2048 | Maple game board; Porcelain numbered tiles with value colors | Numeric values remain text |
| gomoku | Maple board; Polished black and ivory stones | Grid lines and last-move markers preserved |
| guessnumber | Porcelain keypad and guess history; Porcelain panel | Digits and answer feedback remain text |
| jump | Cream fox player with existing squash and jump rotation | Platforms and sky remain existing vector art |
| linklink | Twenty distinct rendered tile faces; Porcelain tiles; Navy velvet board | Stored pair keys unchanged; vector stone obstacles retained |
| ludo | Red and blue toy airplane pieces; Maple board | Player numbers and route colors preserved |
| match3 | Six candy silhouettes; Rainbow special sprite; Navy velvet board | Special power badges, stripes, ice and saved color identities preserved |
| memory | Eight paired fruit card faces; Navy velvet card backs | Existing pair identities retained in saves |
| minesweeper | Maple board; Porcelain closed cells; Bomb sprite on revealed mines | Neighbor counts and flags remain text |
| oldmaid | Porcelain card faces; Navy velvet backs; Fox Joker card | Rank/suit text and hand counts preserved |
| paopao | Six bubble colors; Bomb sprite; Flying and next bubbles | Trajectory and background remain existing vector |
| pinball | Navy velvet player frame and mission surface | Existing native Space Cadet playfield-HD artwork and WASM display remain |
| plank | Cream fox player; Wood bridge plank sprite | Pillars and sky remain existing vector art |
| popstar | Five distinct candy silhouettes by original color; Navy velvet game board | Clear effects and score labels remain existing |
| reversi | Green baize board; Polished black and ivory disks | Legal-move markers preserved |
| screw | Copper screw detail inside original colored rings; Porcelain background texture | Colored panel silhouettes and reachable markers retained |
| shuerte | Maple board; Porcelain numbered cells | Target digits and timing feedback preserved |
| snake | Canvas apple food; Glass snake body segments | Directional eyes and grid remain vector |
| spider | Green baize board; Porcelain card fronts; Navy velvet card backs | Rank and suit symbols preserved |
| sudoku | Maple board; Porcelain numbered cells | Puzzle numbers, notes and selection preserved |
| territory | Maple dots-and-boxes play surface | Ownership colors, nodes and edges preserved |
| tetris | Canvas falling and settled blocks | Next-piece preview remains vector |
| tictactoe | Maple board; Porcelain X/O cells | Player X/O marks remain text |
| turkey | Maple board; Color-tinted porcelain sliding blocks | Block widths, labels and effects preserved |
| uyangle | Twelve fruit tile identities; Fruit tray and holding slots; Porcelain tile surface | Existing tile IDs and overlap rules retained |
| watermelon | Nine fruit evolution sprites; Next fruit and aim ghost | Physics and background remain existing |
| watersort | Navy velvet bottle play surface | Original colored liquid layers and glass bottle geometry preserved |
| westernchess | Maple light and dark squares | Distinct chess glyphs and move/capture highlights preserved |
| wordguess | Porcelain clue cards and history panel | Word bank content remains existing |
| zuma | Glass ball chain and launcher balls; Jade frog launcher; Maple grain play surface | Track, hole, trajectory and particles remain existing |

## Limits and retained assets

- The native Space Cadet playfield, WASM engine, lamps, ball and occlusion renderer retain their prior implementation and HD artwork. Only its external frame and mission surface receive the new material.
- Platform skies/pillars, several grid lines, liquid geometry, card suits/ranks, chess glyphs, numerical labels and effects remain code-drawn so existing gameplay meaning stays legible.
- Original platform hero files remain loadable as fallback but successful normal play draws the new fox. Original card/deck motifs may remain in small auxiliary deck/collection controls; the actual playable card backs/fronts receive the new materials.
- Screenshots verify local browser presentation and module lifecycle. Native Android rendering, release signing and per-game package update installation are verified by the root task separately.

## Deferred contrast correction

The signed content1 baseline has low contrast for Blackjack player names and scores against the new dark green baize. `blackjack-detail.png` records the shipped baseline. `blackjack-contrast-candidate.png` records the visually corrected candidate, and `game-art-contrast.patch` contains the one-line CSS fix. At root request, this correction was removed from production CSS after capture so the signed baseline remains stable for the isolated game-update test. The candidate is not claimed as shipped.

`home-single.png` and `home-double.png` verify the actual 37-game directory icon renderer is hooked into the homepage. All art-generation prompts for the two atlases created by this subtask are retained in `imagegen-prompts.json`; the candy and fruit atlas generation provenance belongs to the root task.
