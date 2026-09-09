# Zuma classic v2 dedicated art

Production art version: **1.1.0**. Existing directory icon and shared art version 1.0.1 are preserved. Runtime entry point: [manifest](../../assets/game-art/zuma/manifest.json), `classic` field.

These are original, imagegen-produced ancient-temple assets: weathered stone, green jade, bronze-gold fittings and saturated engraved mineral marbles. The background supports a center crop for portrait play. Track geometry, live labels, progress fill and coin effects remain renderer work.

## Final assets

The initial three files are original generated PNG outputs copied without pixel alteration. Their total is **8,525,305 bytes** (8.13 MiB). The later optional mouth-motion extension is documented below.

| File beneath assets/game-art/zuma/classic-v2 | Actual dimensions | Bytes | PNG type |
| --- | --- | ---: | --- |
| temple-background.png | 1536 × 1024 | 3,787,694 | RGB, opaque |
| temple-sprites.png | 1774 × 887 | 2,226,513 | RGBA, verified transparency |
| temple-ui.png | 1536 × 1024 | 2,511,098 | RGB, opaque interior sampling |

SHA-256 values are recorded under `classic.files` in the manifest. No image was resized, cropped, recompressed or background-removed using Python or another pixel-editing script. Source rectangles are sampled by the actual browser Canvas drawing API at runtime.

## Runtime mapping

All coordinates are source pixels `[x, y, width, height]`.

| Sprite | Rect | Identifying feature |
| --- | --- | --- |
| RED | [24, 23, 387, 387] | Ivory-gold angular sun |
| YELLOW | [1355, 22, 390, 390] | Dark stepped spiral |
| GREEN | [910, 20, 393, 393] | Pale leaf |
| BLUE | [466, 22, 388, 388] | Pale wave |
| PURPLE | [28, 458, 387, 387] | Pale four-point star |
| ORANGE | [467, 458, 387, 387] | Pale three-prong flame |
| Frog | [892, 416, 433, 433] | Jade launcher, top-down, facing up / negative Y |
| Skull | [1371, 415, 363, 445] | Stone chain entrance, mouth pointing down |

The source sheet visually orders its first row red, blue, green, yellow; **the manifest array is deliberately reordered RED, YELLOW, GREEN, BLUE, PURPLE, ORANGE** to match the engine. It must not be replaced with equal-grid iteration. Actual imagegen output dimensions differ from the requested size, so source rectangles were measured from the returned PNG.

Frog mouth anchor is approximately `[0.5, 0.19]` of the padded source rectangle. Skull mouth anchor is approximately `[0.48, 0.74]`. Both are visual attachment anchors, not collision geometry.

### UI sampling constraint

The final UI image remains RGB. The image generator baked a checkerboard into the exterior despite two background-extraction attempts. This is **not** a transparent atlas and must never be drawn as a full image or as full quadrant cells.

The approved fallback uses four wholly opaque, interior rectangles. Canvas inspection confirms these rectangles contain only the intended stone/metal artwork, no checkerboard. Straight top/bottom rails and broad inner textures provide usable stretchable areas. Some outer ornamental corners are intentionally omitted.

| UI | Opaque source rectangle |
| --- | --- |
| panel | [134, 220, 536, 173] |
| meter | [909, 259, 505, 96] |
| button | [116, 612, 566, 214] |
| plaque | [914, 617, 496, 211] |

Do not infer rounded transparent corners or draw shadows/background from outside these rectangles. The renderer may stretch/repeat these interiors and add its own appropriate edge treatment.

## Verification and evidence

- [Actual Canvas source-rectangle preview](../evidence/zuma-classic-v2/sampling-preview.png) renders all six marbles at **24, 36 and 48 px** against cream, dark and temple-texture backgrounds. Complete round silhouettes and distinct colors are visible; no checkerboard rectangles, cut edges or halo panels were observed.
- The same screenshot renders the complete frog and skull, plus all four exact UI source rectangles. The selected UI rectangles contain no exterior checkerboard.
- [Alpha measurements](../evidence/zuma-classic-v2/alpha-result.json): sprites have alpha range 0–255, **661,667 fully transparent pixels (42.0496%)**, and all four image corners have alpha 0. Background/UI are correctly reported opaque.
- [Measured sprite bounds](../evidence/zuma-classic-v2/bounds-result.json) and [actual sampled mappings](../evidence/zuma-classic-v2/sampling-result.json) preserve machine-readable evidence.
- [Preview HTML](../evidence/zuma-classic-v2/asset-preview.html) draws the production images and reads the production manifest; it does not fabricate game state or replace production code.
- This document verifies dedicated source art and actual browser sampling. Actual game integration, portrait/landscape layout, interaction and native-device performance are validated by the renderer/native owners separately. It does not claim those tests from the asset preview.

The isolated browser used CDP 9356 and local HTTP 8876. No ADB/device operation was performed for this asset task.

## Generation provenance

Built-in imagegen was used after reading `/Users/jacklee/.codex/skills/.system/imagegen/SKILL.md`. Local reference images were viewed before editing. Generation session directory: `01a08061-89f0-73d1-a6f6-45a485edeeab`.

| Result | Generation output filename | Disposition |
| --- | --- | --- |
| Background | exec-925f66c1-8d77-45ba-95a9-2881b04e6e39.png | Final background |
| Initial sprites | exec-9b0913d6-4cc3-4b6c-845e-4bad56a53bc1.png | Rejected RGB baked checkerboard |
| Sprite alpha extraction | exec-15a0b9fa-bcac-4c0e-950d-83a31f665c9a.png | Final RGBA sprite atlas |
| Initial UI | exec-decd3524-27e5-48a1-be4e-e5ffb4622bb2.png | Rejected exterior transparency |
| UI extraction attempt 1 | exec-1a2ee805-b15a-4c64-b54b-2bedebac7eac.png | Still RGB; retained for approved opaque interior sampling |
| UI extraction attempt 2 | exec-80a06f75-907b-451b-89b6-64cd23ff4879.png | Still RGB; not used in production |

Background was generated first. The sprite generation referenced that background for material/light coherence. UI generation referenced background and initial sprites for the same art direction. Background-extraction calls used their respective generated atlas as the edit target. Rejected drafts are retained under `.local/qa-zuma-art/` for local audit, not packaged as production assets.

## Optional mouth-motion extension

The initial three PNGs remain byte-for-byte unchanged. A fourth original asset, `classic-v2/mouth-motion.png`, supplements them through `classic.motion`. It replaces the former upright circular barrel-like mouth with broad front lips in closed/open/gulp poses and provides a detached U-shaped skull mandible for independent animation.

- Actual output: **1254 × 1254 RGBA**, **1,874,786 bytes**.
- SHA-256: `91b073928b2796dc30bf130b87cffdec55d9e4007d9129e52d2e255011f6f645`.
- Four current PNGs total: **10,400,091 bytes (9.92 MiB)**.
- Frog frame order: `closed`, `open`, `gulp`.
- Registered square source rectangles: `[20,3,600,600]`, `[637,3,600,600]`, `[20,619,600,600]`.
- Detached skull jaw source rectangle: `[676,744,529,396]`; preserve this aspect ratio.
- Frog still faces up/negative Y. Approximate mouth anchor is `[0.5,0.235]` within its 600-pixel rectangle. Skull jaw faces down.
- The source coordinates compensate for the generator's roughly 10–14 pixel cell registration differences. This keeps the body aligned while the mouth changes. They are not equal 627-pixel quadrants.
- [Actual registered source-rectangle preview](../evidence/zuma-classic-v2/motion-preview.png) shows all four sprites on dark and cream backgrounds, with no visible checkerboard. [Alpha data](../evidence/zuma-classic-v2/motion-alpha-result.json) records alpha 0–255 and **728,279 fully transparent pixels (46.313%)**. Corner alpha values are `[0,0,1,0]`; the one alpha-1 corner is nearly transparent, not asserted alpha-zero.
- [Preview HTML](../evidence/zuma-classic-v2/motion-preview.html) reads the actual `classic.motion` mapping. This is sprite/registration QA; projectile clipping, jaw articulation and gameplay timing are renderer responsibilities, not verified by the still preview.

### Motion generation provenance

All edit references were visually inspected. The initial edit used the existing production `temple-sprites.png` to retain the jade, gold ornament, legs and carved limestone material. The first result mistakenly duplicated the frog eyes; the second edit removed the lower pair. Transparency requests with long prompts continued to produce RGB checkerboards. The final short, single-purpose background-extraction prompt succeeded in generating true RGBA. Only that final output was copied unchanged into production.

| Output | Generation filename | Disposition |
| --- | --- | --- |
| Three poses + jaw | exec-e9cd141c-b701-45fa-b71d-9d0aee170b8f.png | Rejected duplicated eyes and RGB background |
| Eye correction | exec-5d5dcf24-9b53-4a5b-b3af-8745c7f9a051.png | Correct anatomy; RGB background |
| Long alpha extraction | exec-6d4738f2-6fb4-4b70-908d-7133697f2a3a.png | Still RGB |
| Short alpha extraction | exec-29db014d-d411-4ad2-8542-22523dbdc56f.png | Final RGBA motion atlas |

### Exact motion prompt

```text
Use case: precise-object-edit.
Asset type: production animation sprite atlas derived from the referenced ancient jade frog and stone skull.
Input image: EDIT TARGET AND DESIGN REFERENCE. Preserve the existing frog's carved emerald jade material, worn gold ornament down its back, crouched legs, toe details, temple craftsmanship and overhead lighting. Preserve the skull's ivory stone texture and carved geometric style. Change the frog's head/mouth design as described below; output a NEW separate motion atlas rather than altering the original sheet.

Output: square transparent RGBA PNG, 1536x1536, exactly 2 columns by 2 rows. Four independent square cells, no visible grid. True alpha-zero outside each object, not a painted checkerboard or solid matte. Leave at least 9% transparent margin inside every cell. Every toe and object contour must remain inside its cell. No text, numerals or labels.

TOP LEFT: full jade frog frame 1, mouth CLOSED.
TOP RIGHT: the SAME full jade frog frame 2, mouth WIDE OPEN to receive a marble.
BOTTOM LEFT: the SAME full jade frog frame 3, mouth PARTLY CLOSED in a gulping motion, slight throat bulge.
BOTTOM RIGHT: ONE detached skull LOWER JAW ONLY: a curved U-shaped ivory stone mandible with a row of chunky stone teeth and ancient relief, facing the bottom edge of the canvas, matching the skull in the input. Its center is transparent empty space, not a black filled mouth. No upper skull, no eyes, no frog in this cell. It will translate and rotate separately under the old skull.

Frog animation registration: all three frogs have exactly the same body silhouette, scale, pose and centered position within their cells. Fixed orthographic overhead camera, head facing canvas TOP / negative Y in every frame. Body tail points down. Keep body, eyes, legs and gold back ornament identical between frames; only the lips/lower jaw and throat change.
CRITICAL ANATOMY CORRECTION: the old reference has a circular vertical cannon hole on top of the frog's head. REPLACE that structure entirely with a believable BROAD FROG MOUTH AT THE VERY FRONT EDGE OF THE HEAD. A wide horizontal crescent-shaped mouth, upper lip and lower lip, broad flat snout, two bulbous jade eyes situated behind the mouth to left and right. Think of a real frog's broad front mouth opening toward the top edge, seen directly from above; it must feel like jaws that can BITE and SWALLOW. No pipe, no chimney, no round brass cannon barrel, no hole rising from the forehead. No ball sitting on top of the head.
In frame 1 the front lips meet in a clear curved seam. In frame 2 the lower jaw extends forward toward the top edge so a broad dark recessed mouth cavity is visible BETWEEN upper and lower lips; a marble can visibly enter that cavity from in front. In frame 3 the lips close partway over the cavity, creating a distinct swallow pose. Mouth cavity is dark shaded real jade interior, no pre-drawn marble and no tongue protruding.
Serious detailed classic temple game art, saturated jade, fine mineral cracks, restrained gold, not cute toy or candy. Crisp silhouette and readable broad lip opening at mobile scale. Keep exact same lighting and material across all frames. Actual alpha transparency is mandatory.
```

### Exact anatomy correction prompt

```text
Use case: precise-object-edit. The supplied image is the EDIT TARGET.
Fix only the following two defects in this 2x2 sprite atlas, keep all other artwork, materials, poses and positions unchanged.
1. Each of the three frog frames currently has FOUR EYES. Remove the SECOND/LOWER eye pair: those are the oval green-gem-and-gold rings on the left and right shoulders directly BELOW the mouth, beside the upper corners of the big gold back ornament. Replace both of those lower eye bumps with plain continuous carved green jade body surface. Each frog must have EXACTLY TWO eyes, keeping ONLY the topmost left and right eyes on its head. Do not add new eyes. Keep the closed/open/gulping mouth states unchanged. Keep the legs, toes and gold central ornament unchanged.
2. Remove ALL of the baked gray-white checkerboard background. Return a genuine RGBA PNG with actual alpha 0 in every empty area outside the three frogs and the jaw, including the hollow space inside the U-shaped jaw. Do not draw a transparency checkerboard or any colored backdrop. Preserve clean antialiased opaque object edges and all fingers and teeth.
Keep exactly the same 1254x1254 square canvas, 2x2 layout and sprite alignment. Do not crop any objects, do not change scale. No text.
```

### Long alpha attempt

```text
Use case: background-extraction. Make the background TRANSPARENT.
The input image is an edit target. Its gray-and-white checkerboard is baked into an opaque RGB image. REMOVE that entire checkerboard and all other background pixels outside the objects. Deliver a genuine RGBA PNG with ALPHA ZERO in the empty space, not another visual imitation of transparency. No checkerboard should remain in any visible RGB pixels. Keep anti-aliased object edges with appropriate partial alpha. Do not add any replacement colored background, shadow mat, grid, floor or border.
Preserve all three jade frogs and the isolated stone jaw, their materials, exact silhouettes, original size, relative position, and original canvas aspect ratio. The hollow area within the U-shaped jaw must also be transparent. Keep the black recessed mouth cavities in the frogs opaque. This is solely a clean professional transparent cutout operation; do not redesign the assets, do not crop objects, do not merge them, do not change their colors.
```

### Successful short alpha prompt

```text
Make the background transparent. Remove the checkerboard. Keep the three frogs and the jaw only. Transparent PNG.
```

## Exact prompts

### Background

```text
Use case: stylized-concept.
Asset type: original premium 2D background art for a classic temple marble-shooter game, designed for actual mobile gameplay.
Create a LANDSCAPE 1536 by 1024 pixel scene, completely top-down orthographic view, no camera tilt or perspective. An ancient Mesoamerican-inspired temple stone platform hidden in a tropical forest. Rich finely painted and pre-rendered game-art look reminiscent of handcrafted classic marble-shooter games, tactile worn limestone and dark green jade, oxidized bronze and understated gold, NOT modern candy/toy style.
Composition is functional: the entire central 80% is an unobstructed broad flat, low-contrast blue-green-gray weathered stone surface. Fine understated mineral grain, faint hairline cracks and subtle irregular stone seams; keep all central texture quiet enough that brightly colored 28px marbles will read clearly. No circular centerpiece, no mandala, no central medallion, no raised obstacles in the center. The center is softly illuminated from upper left and is slightly lighter than the edges.
Confine the elaborate art to the outermost 10% border: masterfully carved ancient stepped geometric reliefs, small worn jade inlays, chipped stone lip, a few restrained aged bronze-gold corner ornaments, patches of moss and lush overlapping tropical vine leaves at the far corners. Ornamental edges should feel like a real ancient stone altar, not a modern UI frame. Subtle ambient occlusion and detailed aged material depth. Border decoration must not intrude far into the playable area.
This background must work in landscape and also be center-cropped to portrait. Keep important central play space neutral in either crop.
Absolutely NO marble track, NO rails, NO pathways winding through the center, NO frog, NO skull, NO marbles, NO characters, NO coins, NO words, NO letters, NO digits, NO logos, NO interface controls, NO watermark. The game engine will overlay all track, actors and UI. Opaque image with edge-to-edge art.
```

### Sprite atlas

```text
Use case: stylized-concept.
Asset type: production transparent SPRITE ATLAS for a classic ancient-temple marble shooter, eight separate original sprites.
Input image is ONLY a MATERIAL AND LIGHTING STYLE REFERENCE: ancient weathered green jade, limestone and aged bronze-gold. Do NOT reproduce its stone background or frame.
Generate a LANDSCAPE transparent PNG, 2048 by 1024 pixels, exactly FOUR equal columns by TWO equal rows, eight independent square cells. Each sprite is centered in its own cell and fully contained, with at least 12% completely transparent safety padding around ALL sides. No object touches a cell border and no shadow crosses cells. Truly transparent alpha background everywhere outside the objects, no colored backdrop, no checkerboard, no matte, no smoke, no ground plane. Each individual object has a crisply readable silhouette.
Classic high-quality pre-rendered game art, richly colored polished mineral spheres with carved ancient geometric motifs, tactile stone and jade craftsmanship, subtle hand-painted texture details, warm upper-left lighting and darker lower-right shading. Not candy, not bubbles, not gummy toys, not modern cartoon stickers.
Exact order, left to right:
TOP ROW cell 1: a PERFECTLY ROUND ruby-red stone MARBLE, complete circular contour, one large deeply engraved ivory-gold angular SUN symbol centered on its visible hemisphere.
TOP ROW cell 2: a PERFECTLY ROUND lapis-blue stone MARBLE, complete circular contour, one large deeply engraved pale angular WATER WAVE symbol centered on its visible hemisphere.
TOP ROW cell 3: a PERFECTLY ROUND emerald-green stone MARBLE, complete circular contour, one large deeply engraved pale LEAF/DOUBLE-CHEVRON symbol centered on its visible hemisphere.
TOP ROW cell 4: a PERFECTLY ROUND golden-yellow stone MARBLE, complete circular contour, one large deeply engraved dark ochre stepped SPIRAL symbol centered on its visible hemisphere.
BOTTOM ROW cell 1: a PERFECTLY ROUND amethyst-purple stone MARBLE, complete circular contour, one large deeply engraved pale four-point STAR symbol centered on its visible hemisphere.
BOTTOM ROW cell 2: a PERFECTLY ROUND burnt-orange stone MARBLE, complete circular contour, one large deeply engraved pale angular THREE-PRONG FLAME symbol centered on its visible hemisphere.
All six marbles have the same diameter and appear as round SPHERES, not flat disks or coins. Saturated base colors remain unmistakably distinct even at 24px; the large single symbols support color recognition. No bands wrapping outside the silhouette.
BOTTOM ROW cell 3: an ornate carved JADE FROG LAUNCHER seen in a TRUE ORTHOGRAPHIC TOP-DOWN VIEW, symmetrical two visible bulbous eyes, detailed ancient etched ridges on its back, spread sturdy forelegs and crouched hind legs, weathered jade with a few inset aged-gold accents. The frog's HEAD and circular OPEN MOUTH face the TOP EDGE of the canvas (12 o'clock / negative Y). Tail/back is toward bottom edge. The mouth is empty and dark, ready to hold a separately drawn marble. No ball already in its mouth. It is a serious beautifully carved temple idol, not a cute toy or upright mascot. Full toes and body inside the cell.
BOTTOM ROW cell 4: a carved weathered ivory-limestone SKULL ENTRANCE viewed from directly above with a wide deep BLACK OPEN MOUTH pointing toward the BOTTOM EDGE of the canvas (6 o'clock / positive Y), designed as the ball-chain sink hole. The two empty eye sockets are above the mouth, ancient stepped relief and sparse moss on outer stone edges, no blood, no gore. Keep the entire stone outline and mouth rim inside the cell, no ground/background.
No text, no numerals, no labels, no coins, no unrelated decorations. All eight sprites match the same classic ancient temple game art direction. Alpha transparency and safe complete circular marble contours are mandatory.
```

### UI atlas

```text
Use case: stylized-concept.
Asset type: transparent PNG USER INTERFACE SPRITE ATLAS for a classic ancient-temple marble-shooter game, FOUR independent original ornaments intended for runtime nine-slice scaling.
Input images are ONLY material/style references: keep the background's weathered stone/jade/aged gold and the sprites' detailed carved craftsmanship. Do not reproduce either reference image layout or any frog, skull, sphere or foliage.
Generate a landscape 1536 by 1024 PNG with exactly TWO columns and TWO rows, four equal cells. Each entire UI object is centered inside its own cell, with at least 10% completely transparent padding around all sides. Truly transparent alpha outside the four objects, no colored background, no gray background, no baked checkerboard pattern, no ground plane, no hard rectangular shadow. The objects must be fully separate and never touch. Classic meticulously painted and pre-rendered ancient temple game UI, tactile chips and carved recesses, bronze-gold edge wear, dark jade and mineral stone, warm upper-left light. Not glossy modern app cards, not modern rounded plastic pills.
TOP LEFT / PANEL: a wide low horizontal ancient stone-and-bronze SCORE HEADER BAR, about 4:1 width to height. Weathered bronze-gold carved frame around a flat dark blue-green inset stone center; restrained symmetrical stepped Mayan-style geometric end caps on left and right. The central 65% is clean FLAT DARK texture where large ivory game text can later be overlaid. Keep upper and lower rails straight and repetitive so the center can stretch horizontally in nine-slice. No text, no icons, no gemstones in the central text area.
TOP RIGHT / METER: a wide narrow EMPTY GOLDEN PROGRESS TROUGH, about 5:1 width to height. A thick aged-gold rim with small green jade end caps encloses one long dark recessed empty channel. The channel is straight, continuous and unfilled, large enough for a colored progress fill to be drawn later. No ticks, no writing, no segment divisions. Full outline with safe transparent margin.
BOTTOM LEFT / BUTTON: a richly carved GREEN JADE RECTANGULAR BUTTON, about 2.5:1 width to height, shallow beveled corners and an aged gold outer edge. Subtle ancient relief only on the left and right ends. Broad center completely plain flat dark emerald jade where white button labels can be drawn later. No symbols or text, no modern soft-pill shape. Clear raised tactile pressable surface.
BOTTOM RIGHT / PLAQUE: a small WEATHERED LIMESTONE AND BRONZE RECTANGULAR PLAQUE, about 2.5:1 width to height, chipped carved stone corner blocks and a fine gold inset border around a plain DARK BRONZE center. A small restrained turquoise stud at each far left/right edge. Flat open center for later numeric/text overlay; no text or icon in the artwork.
All four objects have matching shallow depth, upper-left lighting and identical ancient temple art language. Preserve uninterrupted edges and flat repeatable centers suitable for nine-slice scaling. Absolutely no words, letters, numbers, logos, watermark, marbles or characters. Real alpha transparency is mandatory.
```

### Background extraction (used for sprite and first UI extraction)

```text
Use case: background-extraction. Make the background TRANSPARENT.
The input image is an edit target. Its gray-and-white checkerboard is baked into an opaque RGB image. REMOVE that entire checkerboard and all other background pixels outside the objects. Deliver a genuine RGBA PNG with ALPHA ZERO in the empty space, not another visual imitation of transparency. No checkerboard should remain in any visible RGB pixels. Keep anti-aliased object edges with appropriate partial alpha. Do not add any replacement colored background, shadow mat, grid, floor or border.
Preserve all illustrated objects, their materials, exact silhouettes, original size, relative position, and original canvas aspect ratio. This is solely a clean professional transparent cutout operation; do not redesign the assets, do not crop objects, do not merge them, do not change their colors.
```

### Second UI extraction

```text
Remove the gray-and-white checkerboard background from this image and make that background fully transparent. Return a transparent PNG, not an image showing a checkerboard.

Keep only the four isolated ancient stone game UI objects. Keep all of each object's colored stone/gold outline and solid dark center. Everything outside those four shapes must have alpha transparency, including all four image corners and the large empty areas between them. Preserve the current positions and the 1536x1024 image size. Do not redraw the checker pattern. Do not draw a new background.
```
