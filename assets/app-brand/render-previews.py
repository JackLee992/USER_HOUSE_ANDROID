"""Generate launcher density-neutral layers and QA masks from imagegen artwork.

Only technical resizing, centering, alpha compositing, and system mask previews;
all brand artwork and transparency originate from the built-in imagegen tool.
Run with Python 3 and Pillow. Output stays inside assets/app-brand.
"""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent
SIZE = 1080
SAFE_RADIUS = SIZE * 66 / 108 / 2
BACKGROUND = "#061744"
src = Image.open(BASE / "foreground-source.png").convert("RGBA")
alpha = src.getchannel("A")
# Exclude negligible (< 6.3%) matte fringe only for measuring meaningful artwork.
# The source alpha is preserved, not thresholded in the delivered image.
core = alpha.point(lambda v: 255 if v >= 16 else 0)
box = core.getbbox()
cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
pixels = core.load()
radius = max(math.hypot(x - cx, y - cy)
             for y in range(box[1], box[3])
             for x in range(box[0], box[2]) if pixels[x, y])
scale = (SAFE_RADIUS - 8) / radius
scaled = src.resize((round(src.width * scale), round(src.height * scale)), Image.Resampling.LANCZOS)
foreground = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
foreground.alpha_composite(scaled, (round(SIZE / 2 - cx * scale), round(SIZE / 2 - cy * scale)))
foreground.save(BASE / "foreground.png", optimize=True)
background = Image.new("RGBA", (SIZE, SIZE), BACKGROUND)
background.save(BASE / "background.png", optimize=True)
flat = Image.alpha_composite(background, foreground)
# Android reserves 18 dp on every side; simulate the 72 dp static viewport.
inset = round(SIZE * 18 / 108)
viewport = flat.crop((inset, inset, SIZE - inset, SIZE - inset))
def mask_shape(name, size):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    if name == "circle":
        d.ellipse((0, 0, size - 1, size - 1), fill=255)
    else:
        # Superellipse x^4 + y^4 = 1 is a representative squircle, not one OEM mask.
        p = mask.load()
        r = (size - 1) / 2
        for y in range(size):
            for x in range(size):
                if (abs((x-r)/r) ** 4 + abs((y-r)/r) ** 4) <= 1:
                    p[x,y] = 255
    return mask
sheet = Image.new("RGB", (900, 520), "#edf0f5")
d = ImageDraw.Draw(sheet)
for col, name in enumerate(("circle", "squircle")):
    mask = mask_shape(name, viewport.width)
    masked = viewport.copy()
    masked.putalpha(mask)
    for px in (48, 96, 192):
        masked.resize((px, px), Image.Resampling.LANCZOS).save(BASE / f"preview-{name}-{px}.png")
    x = 65 + col * 440
    d.text((x, 24), name + " / adaptive 72 dp viewport", fill="#243047")
    big = masked.resize((280, 280), Image.Resampling.LANCZOS)
    sheet.paste(big, (x, 55), big)
    for i, px in enumerate((48, 96)):
        small = masked.resize((px, px), Image.Resampling.LANCZOS)
        sx = x + i * 125
        sheet.paste(small, (sx, 375), small)
        d.text((sx, 487), str(px) + " px", fill="#243047")
sheet.save(BASE / "mask-preview.png", optimize=True)
Image.open(BASE / "master.png").resize((48,48), Image.Resampling.LANCZOS).save(BASE / "app-icon-48.png")
a = foreground.getchannel("A")
core_final = a.point(lambda v: 255 if v >= 16 else 0)
b = core_final.getbbox()
p = core_final.load()
final_radius = max(math.hypot(x-SIZE/2, y-SIZE/2)
                   for y in range(b[1], b[3])
                   for x in range(b[0], b[2]) if p[x,y])
report = {
    "generatedMaster": {"size": list(Image.open(BASE / "master.png").size), "tool": "built-in image_gen"},
    "foregroundLayerPx": [SIZE, SIZE],
    "layerDp": 108,
    "safeCircleDp": 66,
    "coreAlphaMeasurementThreshold": 16,
    "alphaPreserved": True,
    "coreBoundsPx": list(b),
    "coreDiameterDp": round(final_radius * 2 / SIZE * 108, 2),
    "safeAreaPass": final_radius <= SAFE_RADIUS,
    "staticMaskViewportDp": 72,
    "backgroundColor": BACKGROUND,
    "previewsPx": [48, 96, 192],
    "squircleNote": "Representative superellipse mask; OEM shapes may differ."
}
(BASE / "icon-validation.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
