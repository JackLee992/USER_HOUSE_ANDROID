"""Derive sizes, adaptive layers, and mask previews from imagegen artwork.

This script does not draw or retouch the brand symbol. It preserves the generated
alpha and only scales, centers, composites, and simulates Android launcher masks.
Requires Pillow. All files remain in this directory; no app resources are edited.
"""
from pathlib import Path
import hashlib
import json
import math
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent
SIZE = 1080
BACKGROUND = "#061744"
SAFE_RADIUS = SIZE * 66 / 108 / 2
source = Image.open(BASE / "foreground-source.png").convert("RGBA")
core = source.getchannel("A").point(lambda value: 255 if value >= 16 else 0)
box = core.getbbox()
assert box, "Generated artwork is empty"
cx, cy = (box[0]+box[2])/2, (box[1]+box[3])/2
pixels = core.load()
radius = max(math.hypot(x-cx, y-cy)
             for y in range(box[1],box[3]) for x in range(box[0],box[2]) if pixels[x,y])
scale = (SAFE_RADIUS-8)/radius
scaled = source.resize((round(source.width*scale),round(source.height*scale)),Image.Resampling.LANCZOS)
foreground = Image.new("RGBA",(SIZE,SIZE),(0,0,0,0))
foreground.alpha_composite(scaled,(round(SIZE/2-cx*scale),round(SIZE/2-cy*scale)))
foreground.save(BASE/"foreground.png",optimize=True)
background = Image.new("RGBA",(SIZE,SIZE),BACKGROUND)
background.save(BASE/"background.png",optimize=True)
master = Image.alpha_composite(background,foreground)
master.save(BASE/"master.png",optimize=True)

# A launcher shows the central 72 dp viewport from the 108 dp adaptive layers.
inset = round(SIZE*18/108)
viewport = master.crop((inset,inset,SIZE-inset,SIZE-inset))
viewport.resize((512,512),Image.Resampling.LANCZOS).convert("RGB").save(BASE/"app-icon.png",optimize=True)
for size in (48,72,96,144,192):
    viewport.resize((size,size),Image.Resampling.LANCZOS).save(BASE/f"launcher-{size}.png",optimize=True)

def mask_shape(name,size):
    mask = Image.new("L",(size,size),0)
    if name == "circle":
        ImageDraw.Draw(mask).ellipse((0,0,size-1,size-1),fill=255)
    else:
        pixels = mask.load()
        r = (size-1)/2
        for y in range(size):
            for x in range(size):
                if (abs((x-r)/r)**4+abs((y-r)/r)**4) <= 1: pixels[x,y]=255
    return mask

sheet = Image.new("RGB",(960,670),"#EEF1F7")
draw = ImageDraw.Draw(sheet)
font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
font = ImageFont.truetype(font_path,20) if Path(font_path).exists() else ImageFont.load_default()
title = ImageFont.truetype(font_path,34) if Path(font_path).exists() else ImageFont.load_default()
draw.text((40,24),"Nookcade",font=title,fill="#061744")
draw.text((40,70),"International icon / imagegen artwork / Android mask review",font=font,fill="#465571")
for col,name in enumerate(("circle","squircle")):
    masked = viewport.copy()
    masked.putalpha(mask_shape(name,viewport.width))
    x = 85+col*460
    draw.text((x,115),name.title()+" mask",font=font,fill="#061744")
    big = masked.resize((280,280),Image.Resampling.LANCZOS)
    sheet.paste(big,(x,154),big)
    for i,size in enumerate((48,96,192)):
        icon = masked.resize((size,size),Image.Resampling.LANCZOS)
        icon.save(BASE/f"preview-{name}-{size}.png",optimize=True)
        if size < 192:
            sx = x+i*160
            sheet.paste(icon,(sx,480),icon)
            draw.text((sx,592),str(size)+" px",font=font,fill="#465571")
draw.text((40,634),"108 dp layers / centered 66 dp safe circle / no lettering in icon",font=font,fill="#465571")
sheet.save(BASE/"mask-preview.png",optimize=True)

core_final = foreground.getchannel("A").point(lambda value: 255 if value >= 16 else 0)
b = core_final.getbbox()
p = core_final.load()
final_radius = max(math.hypot(x-SIZE/2,y-SIZE/2)
                   for y in range(b[1],b[3]) for x in range(b[0],b[2]) if p[x,y])
report = {
    "workingName":"Nookcade", "artworkTool":"built-in image_gen",
    "originalSizePx":list(source.size), "originalMode":source.mode,
    "originalSha256":hashlib.sha256((BASE/"foreground-source.png").read_bytes()).hexdigest(),
    "layersPx":[SIZE,SIZE], "layerDp":108, "safeCircleDp":66,
    "alphaPreserved":True, "coreAlphaMeasurementThreshold":16,
    "coreBoundsPx":list(b), "coreDiameterDp":round(final_radius*2/SIZE*108,2),
    "safeAreaPass":final_radius <= SAFE_RADIUS,
    "backgroundColor":BACKGROUND, "staticMaskViewportDp":72,
    "playStoreIconPx":[512,512], "legacySizesPx":[48,72,96,144,192],
    "maskPreviewSizesPx":[48,96,192],
    "squircleNote":"Representative superellipse; OEM masks may differ.",
    "integrationStatus":"Review assets only; existing app/native icon untouched.",
}
assert report["safeAreaPass"],report
(BASE/"icon-validation.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
