#!/usr/bin/env python3
"""Render a custom 30s social ad for SPECTRE (original motion graphics)."""

from __future__ import annotations

import math
from pathlib import Path
from typing import List, Tuple

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WIDTH = 1080
HEIGHT = 1920
FPS = 30
DURATION_SECONDS = 30
TOTAL_FRAMES = FPS * DURATION_SECONDS

OUTPUT_PATH = Path("/Users/johnmcghee/Documents/SPECTRE/SPECTRE-web/assets/ads/spectre-facebook-instagram-30s.mp4")

ACCENT = (255, 80, 54)
ACCENT_SOFT = (255, 133, 112)
TEXT = (246, 246, 250)
MUTED = (200, 202, 214)

# Coordinate grids for animated gradients.
X = np.linspace(0, 1, WIDTH, dtype=np.float32)[None, :]
Y = np.linspace(0, 1, HEIGHT, dtype=np.float32)[:, None]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Avenir Next.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf"),
    ]
    for p in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


F_BRAND = font(84, True)
F_H1 = font(76, True)
F_H2 = font(56, True)
F_BODY = font(38, False)
F_SMALL = font(28, True)


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def smoothstep(t: float) -> float:
    t = clamp01(t)
    return t * t * (3 - 2 * t)


def ease_out(t: float) -> float:
    t = clamp01(t)
    return 1 - (1 - t) ** 3


def scene_alpha(t: float, start: float, end: float, fade: float = 0.45) -> float:
    if t < start or t > end:
        return 0.0
    a_in = smoothstep((t - start) / fade)
    a_out = smoothstep((end - t) / fade)
    return a_in * a_out


def animated_background(t: float) -> Image.Image:
    # Deep cinematic background with moving accent plumes.
    base = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
    base[:, :, 0] = 6 + 6 * (1 - Y)
    base[:, :, 1] = 8 + 8 * (1 - Y)
    base[:, :, 2] = 14 + 18 * (1 - Y)

    blobs = [
        (0.18 + 0.07 * math.sin(t * 0.45), 0.24 + 0.06 * math.cos(t * 0.35), 0.17, (255, 84, 58), 0.33),
        (0.82 + 0.05 * math.cos(t * 0.52), 0.16 + 0.04 * math.sin(t * 0.43), 0.21, (255, 130, 110), 0.22),
        (0.34 + 0.06 * math.sin(t * 0.33), 0.86 + 0.05 * math.cos(t * 0.48), 0.23, (120, 56, 100), 0.28),
    ]

    for cx, cy, sigma, color, strength in blobs:
        d2 = (X - cx) ** 2 + (Y - cy) ** 2
        g = np.exp(-(d2 / (2 * sigma * sigma))) * strength
        base[:, :, 0] += g * color[0]
        base[:, :, 1] += g * color[1]
        base[:, :, 2] += g * color[2]

    # Subtle diagonal texture.
    stripes = (np.sin((X * WIDTH * 0.035) + (Y * HEIGHT * 0.03) + t * 1.7) + 1) * 0.5
    base *= (0.90 + 0.10 * stripes[:, :, None])

    arr = np.clip(base, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB").convert("RGBA")


def centered(draw: ImageDraw.ImageDraw, text: str, y: int, fnt: ImageFont.FreeTypeFont, fill: Tuple[int, int, int, int]) -> None:
    box = draw.textbbox((0, 0), text, font=fnt)
    w = box[2] - box[0]
    draw.text(((WIDTH - w) / 2, y), text, font=fnt, fill=fill)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_w: int) -> List[str]:
    words = text.split()
    out: List[str] = []
    cur = ""
    for word in words:
        test = word if not cur else f"{cur} {word}"
        if draw.textbbox((0, 0), test, font=fnt)[2] <= max_w:
            cur = test
        else:
            if cur:
                out.append(cur)
            cur = word
    if cur:
        out.append(cur)
    return out


def draw_copy_panel(draw: ImageDraw.ImageDraw, title: str, body: str, alpha: float, y: int = 1260) -> None:
    a = int(255 * alpha)
    if a <= 0:
        return
    x, w, h = 72, WIDTH - 144, 440
    draw.rounded_rectangle((x, y, x + w, y + h), radius=34, fill=(8, 10, 16, int(a * 0.82)), outline=(80, 86, 102, int(a * 0.94)), width=2)

    title_lines = wrap(draw, title, F_H2, w - 100)
    yy = y + 44
    for line in title_lines[:2]:
        centered(draw, line, yy, F_H2, (TEXT[0], TEXT[1], TEXT[2], a))
        yy += 64

    yy += 10
    for line in wrap(draw, body, F_BODY, w - 120)[:3]:
        centered(draw, line, yy, F_BODY, (MUTED[0], MUTED[1], MUTED[2], a))
        yy += 48


def scene_noise(draw: ImageDraw.ImageDraw, t: float, alpha: float) -> None:
    # Fast strips + ticker capsules.
    a = int(255 * alpha)
    if a <= 0:
        return
    labels = ["ASX", "VOL", "GOLD", "RISK", "FX", "NEWS"]
    for i in range(10):
        y = 330 + i * 125
        speed = 210 + i * 18
        x = ((t * speed + i * 170) % (WIDTH + 380)) - 280
        draw.rounded_rectangle((x, y, x + 330, y + 66), radius=22, fill=(255, 90, 70, int(a * 0.16)), outline=(255, 120, 102, int(a * 0.42)), width=2)
        txt = labels[i % len(labels)]
        draw.text((x + 24, y + 19), txt, font=F_SMALL, fill=(255, 150, 136, int(a * 0.85)))


def scene_focus(draw: ImageDraw.ImageDraw, t: float, alpha: float) -> None:
    # Rotating rings and converging signal marks.
    a = int(255 * alpha)
    if a <= 0:
        return
    cx, cy = WIDTH // 2, 840

    for idx, rad in enumerate([170, 225, 282]):
        rot = (t * (24 + idx * 10)) % 360
        draw.arc((cx - rad, cy - rad, cx + rad, cy + rad), start=rot, end=rot + 220, fill=(255, 105, 84, int(a * 0.82)), width=6)
        draw.arc((cx - rad, cy - rad, cx + rad, cy + rad), start=rot + 230, end=rot + 305, fill=(255, 182, 170, int(a * 0.58)), width=4)

    for i in range(6):
        ang = t * 1.8 + i * math.pi / 3
        px = cx + int(math.cos(ang) * 320)
        py = cy + int(math.sin(ang) * 230)
        draw.line((px, py, cx, cy), fill=(255, 120, 104, int(a * 0.45)), width=3)
        draw.ellipse((px - 8, py - 8, px + 8, py + 8), fill=(255, 122, 102, int(a * 0.9)))


def scene_inputs(draw: ImageDraw.ImageDraw, t: float, alpha: float) -> None:
    # Three animated input chips entering and stacking.
    a = int(255 * alpha)
    if a <= 0:
        return
    p = ease_out((t % 1.6) / 1.6)
    cards = [
        ("SUPER CSV", "Retirement holdings", -540, 610),
        ("ASX REPORT", "Brokerage exports", WIDTH + 40, 780),
        ("BULLION", "Gold & silver statements", -500, 950),
    ]
    for i, (title, sub, x0, y) in enumerate(cards):
        target_x = 140
        x = x0 + (target_x - x0) * clamp01((p * 1.2) - i * 0.16)
        w, h = WIDTH - 280, 142
        draw.rounded_rectangle((x, y, x + w, y + h), radius=30, fill=(18, 20, 28, int(a * 0.88)), outline=(255, 107, 86, int(a * 0.9)), width=3)
        draw.text((x + 36, y + 30), title, font=F_SMALL, fill=(255, 152, 136, int(a * 0.96)))
        draw.text((x + 36, y + 74), sub, font=F_BODY, fill=(218, 220, 228, int(a * 0.88)))


def scene_risk(draw: ImageDraw.ImageDraw, t: float, alpha: float) -> None:
    # 2x2 metric dials.
    a = int(255 * alpha)
    if a <= 0:
        return
    dials = [
        ("VaR95", 0.62, 260, 640),
        ("Drawdown", 0.44, 560, 640),
        ("Volatility", 0.71, 260, 980),
        ("Concentration", 0.53, 560, 980),
    ]
    for label, base_v, x, y in dials:
        v = clamp01(base_v + 0.08 * math.sin(t * 1.4 + x * 0.01))
        r = 118
        draw.ellipse((x - r, y - r, x + r, y + r), outline=(92, 95, 112, int(a * 0.7)), width=16)
        start = -90
        end = start + int(360 * v)
        draw.arc((x - r, y - r, x + r, y + r), start=start, end=end, fill=(255, 98, 75, int(a * 0.95)), width=16)
        pct = f"{int(v*100)}%"
        tw = draw.textbbox((0, 0), pct, font=F_BODY)[2]
        draw.text((x - tw / 2, y - 28), pct, font=F_BODY, fill=(246, 246, 250, int(a * 0.95)))
        lw = draw.textbbox((0, 0), label, font=F_SMALL)[2]
        draw.text((x - lw / 2, y + 132), label, font=F_SMALL, fill=(214, 214, 224, int(a * 0.88)))


def scene_growth(draw: ImageDraw.ImageDraw, t: float, alpha: float) -> None:
    # Animated line chart and allocation bars.
    a = int(255 * alpha)
    if a <= 0:
        return

    x0, y0, w, h = 90, 560, WIDTH - 180, 600
    draw.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=28, fill=(12, 14, 20, int(a * 0.85)), outline=(88, 94, 110, int(a * 0.8)), width=2)

    for i in range(6):
        yy = y0 + 90 + i * 84
        draw.line((x0 + 36, yy, x0 + w - 36, yy), fill=(70, 74, 90, int(a * 0.45)), width=1)

    pts = []
    for i in range(12):
        x = x0 + 66 + i * ((w - 132) / 11)
        base = math.sin(i * 0.55 + t * 0.9) * 28
        trend = i * 21
        y = y0 + h - 130 - trend - base
        pts.append((x, y))

    draw.line(pts, fill=(255, 106, 84, int(a * 0.96)), width=7, joint="curve")
    lx, ly = pts[-1]
    draw.ellipse((lx - 11, ly - 11, lx + 11, ly + 11), fill=(255, 126, 107, int(a * 0.95)))

    bar_x = x0 + 70
    bars = [0.42, 0.31, 0.17, 0.10]
    for i, v in enumerate(bars):
        bh = int(210 * v)
        bx = bar_x + i * 176
        by = y0 + h + 130 - bh
        draw.rounded_rectangle((bx, by, bx + 112, y0 + h + 130), radius=18, fill=(255, 97, 75, int(a * (0.7 + 0.08 * i))))


def scene_cta(draw: ImageDraw.ImageDraw, t: float, alpha: float) -> None:
    a = int(255 * alpha)
    if a <= 0:
        return

    draw.rectangle((0, 0, WIDTH, HEIGHT), fill=(6, 7, 11, int(a * 0.62)))
    box_x, box_y, box_w, box_h = 114, 520, WIDTH - 228, 820
    draw.rounded_rectangle((box_x, box_y, box_x + box_w, box_y + box_h), radius=44, fill=(14, 16, 23, int(a * 0.95)), outline=(255, 95, 73, a), width=4)

    centered(draw, "SPECTRE", box_y + 90, F_BRAND, (255, 90, 67, a))
    centered(draw, "Starter Plan", box_y + 250, F_H2, (246, 246, 250, a))
    centered(draw, "$3/month", box_y + 335, F_H1, (255, 105, 86, a))
    centered(draw, "Monitor exposure and risk in one workspace", box_y + 456, F_BODY, (208, 210, 222, a))

    btn_x, btn_y, btn_w, btn_h = box_x + 76, box_y + 590, box_w - 152, 106
    draw.rounded_rectangle((btn_x, btn_y, btn_x + btn_w, btn_y + btn_h), radius=24, fill=(255, 84, 58, a))
    centered(draw, "GET STARTER", btn_y + 30, F_BODY, (255, 255, 255, a))
    centered(draw, "spectre-assets.com", box_y + 736, F_BODY, (255, 176, 162, a))


def render_frame(frame: int) -> np.ndarray:
    t = frame / FPS
    img = animated_background(t)
    draw = ImageDraw.Draw(img, "RGBA")

    # Persistent brand lockup.
    brand_alpha = int(230 + 20 * math.sin(t * 1.4))
    centered(draw, "SPECTRE", 86, F_SMALL, (255, 116, 96, brand_alpha))

    a1 = scene_alpha(t, 0.0, 5.0)
    scene_noise(draw, t, a1)
    draw_copy_panel(draw, "Still running your portfolio in scattered tools?", "Switch noise for a single risk workspace.", a1)

    a2 = scene_alpha(t, 5.0, 10.0)
    scene_focus(draw, t, a2)
    draw_copy_panel(draw, "See signal clearly.", "SPECTRE makes exposure and risk instantly visible.", a2)

    a3 = scene_alpha(t, 10.0, 16.0)
    scene_inputs(draw, t, a3)
    draw_copy_panel(draw, "Import super, ASX, and bullion in minutes.", "Bring existing CSV exports into one flow.", a3)

    a4 = scene_alpha(t, 16.0, 22.0)
    scene_risk(draw, t, a4)
    draw_copy_panel(draw, "Track VaR95, drawdown, volatility, concentration.", "Live risk indicators without spreadsheet gymnastics.", a4)

    a5 = scene_alpha(t, 22.0, 27.0)
    scene_growth(draw, t, a5)
    draw_copy_panel(draw, "Monitor movers and snapshot trends over time.", "Decisions backed by a clear visual risk picture.", a5)

    a6 = scene_alpha(t, 27.0, 30.0, fade=0.65)
    scene_cta(draw, t, a6)

    # Progress accent.
    p = frame / (TOTAL_FRAMES - 1)
    draw.rounded_rectangle((110, HEIGHT - 80, WIDTH - 110, HEIGHT - 62), radius=9, fill=(76, 80, 94, 150))
    draw.rounded_rectangle((110, HEIGHT - 80, 110 + int((WIDTH - 220) * p), HEIGHT - 62), radius=9, fill=(255, 93, 70, 235))

    return np.array(img.convert("RGB"), dtype=np.uint8)


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    writer = imageio.get_writer(
        str(OUTPUT_PATH),
        fps=FPS,
        codec="libx264",
        format="FFMPEG",
        quality=8,
        macro_block_size=1,
        ffmpeg_log_level="error",
    )

    try:
        for i in range(TOTAL_FRAMES):
            writer.append_data(render_frame(i))
            if i % 120 == 0:
                print(f"Rendering... {(100 * i / TOTAL_FRAMES):5.1f}%")
    finally:
        writer.close()

    print(f"Done: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
