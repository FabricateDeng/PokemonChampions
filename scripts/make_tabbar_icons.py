"""Generate tabBar icons for the mini program.

All icons share one visual language: filled/stroked geometry with an
equivalent stroke weight, drawn on a 324px canvas and downsampled to the
required 81x81 so edges stay smooth on retina screens.

Usage:  python scripts/make_tabbar_icons.py
"""
import os
from PIL import Image, ImageDraw

SIZE = 81
SCALE = 4
C = SIZE * SCALE  # working canvas
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "tabbar")

INACTIVE = (0x6A, 0x75, 0x85, 255)
ACTIVE = (0xF2, 0xC4, 0x55, 255)


def canvas():
    img = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def s(v):
    """Scale a size expressed in final 81px pixels."""
    return int(round(v * SCALE))


def draw_dex(d, color):
    # Pokéball: outer ring + centre band + core dot.
    stroke = s(7)
    r = s(30)
    cx = cy = C // 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=stroke)
    d.rectangle([cx - r, cy - stroke // 2, cx + r, cy + stroke // 2], fill=color)
    dot = s(8)
    d.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=color)
    # Punch the band out of the dot so the core reads as a ring.
    d.ellipse([cx - dot + s(4), cy - dot + s(4), cx + dot - s(4), cy + dot - s(4)], fill=color)


def draw_rank(d, color):
    # Three ascending rounded bars.
    base = s(68)
    bar_w = s(14)
    gap = s(9)
    left = (C - (bar_w * 3 + gap * 2)) // 2
    heights = [s(22), s(38), s(54)]
    for i, h in enumerate(heights):
        x = left + i * (bar_w + gap)
        d.rounded_rectangle([x, base - h, x + bar_w, base], radius=bar_w // 2, fill=color)


def draw_team(d, color):
    # Six dots arranged in a hexagon: "a full party of six".
    import math
    outer = s(23.5)
    dot = s(8)
    cx = cy = C // 2
    pts = []
    for i in range(6):
        a = math.radians(-90 + i * 60)
        pts.append((cx + outer * math.cos(a), cy + outer * math.sin(a) * 0.86))
    for (x, y) in pts:
        d.ellipse([x - dot, y - dot, x + dot, y + dot], fill=color)


def draw_profile(d, color):
    # Head + shoulders.
    head = s(11)
    cx = C // 2
    head_cy = C // 2 - s(9)
    d.ellipse([cx - head, head_cy - head, cx + head, head_cy + head], fill=color)
    body_w = s(24)
    body_h = s(20)
    top = head_cy + head + s(4)
    d.pieslice([cx - body_w, top, cx + body_w, top + body_h * 2], 180, 360, fill=color)


ICONS = [
    ("dex", draw_dex),
    ("rank", draw_rank),
    ("team", draw_team),
    ("profile", draw_profile),
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, fn in ICONS:
        for suffix, color in (("", INACTIVE), ("-on", ACTIVE)):
            img, draw = canvas()
            fn(draw, color)
            img = img.resize((SIZE, SIZE), Image.LANCZOS)
            path = os.path.join(OUT_DIR, f"{name}{suffix}.png")
            img.save(path, optimize=True)
            print("wrote", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
