#!/usr/bin/env python3
"""Render an Instagram-style static ad for SPECTRE with HQ supersampling."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

LOGICAL_W, LOGICAL_H = 1080, 1350
SCALE = 2
W, H = LOGICAL_W * SCALE, LOGICAL_H * SCALE

OUT_FEED = Path('/Users/johnmcghee/Documents/SPECTRE/SPECTRE-web/assets/ads/spectre-static-ad-feed-1080x1350.png')
OUT_HQ = Path('/Users/johnmcghee/Documents/SPECTRE/SPECTRE-web/assets/ads/spectre-static-ad-feed-2160x2700.png')

ACCENT = (255, 75, 51)
ACCENT_BRIGHT = (255, 102, 80)
ACCENT_DARK = (119, 40, 32)
TEXT = (245, 246, 250)
MUTED = (179, 184, 198)


def s(v: float) -> int:
    return int(round(v * SCALE))


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    scaled = s(size)
    candidates = [
        Path('/System/Library/Fonts/Supplemental/Avenir Next.ttc'),
        Path('/System/Library/Fonts/Supplemental/Helvetica.ttc'),
        Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf'),
    ]
    for p in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=scaled)
            except OSError:
                continue
    return ImageFont.load_default()


F_BRAND = load_font(34, True)
F_SMALL = load_font(22, False)
F_H1 = load_font(76, True)
F_BODY = load_font(31, False)
F_CHIP = load_font(28, True)
F_H2 = load_font(48, True)
F_CTA = load_font(34, True)


def tw(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> int:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0]


def build_bg() -> Image.Image:
    x = np.linspace(0, 1, W, dtype=np.float32)[None, :]
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]

    arr = np.zeros((H, W, 3), dtype=np.float32)
    arr[:, :, 0] = 4 + 8 * (1 - y)
    arr[:, :, 1] = 5 + 9 * (1 - y)
    arr[:, :, 2] = 8 + 16 * (1 - y)

    glows = [
        (0.16, 0.16, 0.24, (255, 86, 60), 0.30),
        (0.88, 0.18, 0.25, (255, 120, 96), 0.19),
        (0.22, 0.88, 0.27, (108, 42, 88), 0.22),
    ]
    for cx, cy, sig, col, amp in glows:
        d2 = (x - cx) ** 2 + (y - cy) ** 2
        g = np.exp(-(d2 / (2 * sig * sig))) * amp
        arr[:, :, 0] += g * col[0]
        arr[:, :, 1] += g * col[1]
        arr[:, :, 2] += g * col[2]

    texture = (((x * W * 0.044) + (y * H * 0.032)) % 16.0) < 0.85
    arr[:, :, 0] += texture.astype(np.float32) * 7
    arr[:, :, 1] += texture.astype(np.float32) * 3
    arr[:, :, 2] += texture.astype(np.float32) * 4

    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = W / 2, H / 2
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    dmax = np.sqrt(cx * cx + cy * cy)
    vignette = 1 - 0.40 * ((d / dmax) ** 1.45)
    arr *= vignette[:, :, None]

    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGB').convert('RGBA')


def draw_header(draw: ImageDraw.ImageDraw) -> None:
    y = s(36)
    draw.rounded_rectangle((s(36), y, W - s(36), y + s(86)), radius=s(24), fill=(8, 10, 16, 208), outline=(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2], 225), width=s(2))

    ax, ay = s(60), y + s(16)
    draw.ellipse((ax, ay, ax + s(54), ay + s(54)), fill=(255, 84, 58, 255))
    draw.text((ax + s(16), ay + s(10)), 'S', font=F_BRAND, fill=(255, 255, 255, 255))

    draw.text((s(132), y + s(22)), 'SPECTRE', font=F_BRAND, fill=(245, 246, 250, 246))
    draw.text((s(312), y + s(28)), 'Sponsored', font=F_SMALL, fill=(175, 180, 192, 236))

    for i in range(3):
        cx = W - s(74)
        cy = y + s(30) + i * s(12)
        draw.ellipse((cx, cy, cx + s(6), cy + s(6)), fill=(182, 186, 200, 230))


def draw_phone_mockup(img: Image.Image, draw: ImageDraw.ImageDraw) -> None:
    px, py, pw, ph = s(610), s(332), s(400), s(730)

    shadow = Image.new('RGBA', (pw + s(80), ph + s(80)), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow, 'RGBA')
    sd.rounded_rectangle((s(22), s(22), pw + s(52), ph + s(52)), radius=s(64), fill=(0, 0, 0, 150))
    img.alpha_composite(shadow, (px - s(40), py - s(16)))

    draw.rounded_rectangle((px, py, px + pw, py + ph), radius=s(56), fill=(11, 13, 19, 245), outline=(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2], 255), width=s(3))
    draw.rounded_rectangle((px + s(18), py + s(18), px + pw - s(18), py + ph - s(18)), radius=s(44), fill=(7, 9, 14, 255), outline=(68, 72, 88, 160), width=s(1))
    draw.rounded_rectangle((px + s(150), py + s(30), px + s(250), py + s(44)), radius=s(7), fill=(20, 23, 33, 255))

    sx, sy = px + s(34), py + s(84)
    sw, sh = pw - s(68), ph - s(120)
    draw.rounded_rectangle((sx, sy, sx + sw, sy + sh), radius=s(26), fill=(9, 10, 16, 255), outline=(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2], 220), width=s(2))
    draw.text((sx + s(20), sy + s(18)), 'RISK DASHBOARD', font=F_SMALL, fill=(255, 140, 124, 240))

    cx0, cy0, cw, ch = sx + s(20), sy + s(64), sw - s(40), s(248)
    draw.rounded_rectangle((cx0, cy0, cx0 + cw, cy0 + ch), radius=s(18), fill=(11, 12, 18, 250), outline=(70, 74, 92, 130), width=s(1))
    for i in range(5):
        gy = cy0 + s(36) + i * s(42)
        draw.line((cx0 + s(16), gy, cx0 + cw - s(16), gy), fill=(63, 68, 84, 110), width=s(1))

    pts = []
    for i in range(9):
        x = cx0 + s(20) + i * ((cw - s(40)) / 8)
        y = cy0 + ch - s(42) - int(i * s(12)) - int(s(14) * math.sin(i * 0.72))
        pts.append((x, y))
    draw.line(pts, fill=(ACCENT_BRIGHT[0], ACCENT_BRIGHT[1], ACCENT_BRIGHT[2], 255), width=s(5))
    lx, ly = pts[-1]
    draw.ellipse((lx - s(6), ly - s(6), lx + s(6), ly + s(6)), fill=(255, 138, 120, 255))

    kx, ky = sx + s(20), cy0 + ch + s(26)
    labels = ['VaR95', 'Drawdown', 'Volatility', 'Concentration']
    vals = ['2.1%', '8.7%', '16.4%', '41%']
    for i in range(4):
        y0 = ky + i * s(68)
        draw.rounded_rectangle((kx, y0, kx + cw, y0 + s(54)), radius=s(14), fill=(12, 13, 20, 255), outline=(64, 66, 82, 120), width=s(1))
        draw.text((kx + s(16), y0 + s(14)), labels[i], font=F_SMALL, fill=(183, 187, 198, 235))
        draw.text((kx + cw - s(16) - tw(draw, vals[i], F_SMALL), y0 + s(14)), vals[i], font=F_SMALL, fill=(255, 116, 96, 245))


def draw_chip(draw: ImageDraw.ImageDraw, x: int, y: int, text: str) -> None:
    x, y = s(x), s(y)
    w = tw(draw, text, F_CHIP) + s(46)
    draw.rounded_rectangle((x, y, x + w, y + s(58)), radius=s(29), fill=(11, 13, 20, 232), outline=(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2], 225), width=s(2))
    draw.text((x + s(23), y + s(13)), text, font=F_CHIP, fill=(255, 145, 126, 246))


def main() -> None:
    OUT_FEED.parent.mkdir(parents=True, exist_ok=True)

    img = build_bg()
    draw = ImageDraw.Draw(img, 'RGBA')

    draw_header(draw)

    draw.text((s(54), s(174)), 'Portfolio risk.', font=F_H1, fill=(245, 246, 250, 255))
    draw.text((s(54), s(246)), 'One workspace.', font=F_H1, fill=(245, 246, 250, 255))
    draw.text((s(56), s(334)), 'Track super, ASX, and bullion.\nSee risk clearly, fast.', font=F_BODY, fill=(189, 193, 205, 240), spacing=s(4))

    draw_phone_mockup(img, draw)

    draw_chip(draw, 54, 458, 'Super + ASX + Bullion')
    draw_chip(draw, 54, 530, 'VaR95 + Drawdown')
    draw_chip(draw, 54, 602, '$3/month Starter')

    bx, by, bw, bh = s(40), s(1100), s(1000), s(210)
    draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=s(30), fill=(10, 12, 18, 238), outline=(ACCENT[0], ACCENT[1], ACCENT[2], 238), width=s(3))
    draw.text((bx + s(26), by + s(30)), 'SPECTRE', font=F_H2, fill=(255, 100, 78, 252))
    draw.text((bx + s(26), by + s(94)), 'Monitor exposure and risk in one private workspace.', font=F_BODY, fill=(203, 207, 219, 238))

    cta_w, cta_h = s(286), s(86)
    cx = bx + bw - cta_w - s(22)
    cy = by + s(30)
    draw.rounded_rectangle((cx, cy, cx + cta_w, cy + cta_h), radius=s(21), fill=(255, 84, 58, 255))
    cta = 'Learn More'
    draw.text((cx + (cta_w - tw(draw, cta, F_CTA)) / 2, cy + s(22)), cta, font=F_CTA, fill=(255, 255, 255, 255))

    draw.text((bx + s(26), by + s(152)), 'spectre-assets.com', font=F_SMALL, fill=(255, 170, 154, 248))

    rng = np.random.default_rng(7)
    grain = rng.normal(0, 2, (H, W, 1)).astype(np.int16)
    arr = np.array(img.convert('RGB'), dtype=np.int16)
    arr = np.clip(arr + grain, 0, 255).astype(np.uint8)
    final_hq = Image.fromarray(arr, 'RGB')

    # Save HQ master first, then downsample for cleaner feed output.
    final_hq.save(OUT_HQ, format='PNG')
    feed = final_hq.resize((LOGICAL_W, LOGICAL_H), Image.Resampling.LANCZOS)
    feed.save(OUT_FEED, format='PNG')

    print(f'Done HQ: {OUT_HQ}')
    print(f'Done feed: {OUT_FEED}')


if __name__ == '__main__':
    main()
