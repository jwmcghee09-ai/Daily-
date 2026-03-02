#!/usr/bin/env python3
"""Render 3 Instagram-style SPECTRE ad concepts (1080x1350)."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
SCALE = 2
RW, RH = W * SCALE, H * SCALE

ROOT = Path('/Users/johnmcghee/Documents/SPECTRE/SPECTRE-web')
OUT_DIR = ROOT / 'assets' / 'ads' / 'concepts'

ACCENT = (255, 75, 51)
TEXT = (245, 246, 250)
MUTED = (182, 186, 200)


def s(v: float) -> int:
    return int(round(v * SCALE))


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    sz = s(size)
    candidates = [
        Path('/System/Library/Fonts/Supplemental/Avenir Next.ttc'),
        Path('/System/Library/Fonts/Supplemental/Helvetica.ttc'),
        Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf'),
    ]
    for p in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=sz)
            except OSError:
                continue
    return ImageFont.load_default()


F_BRAND = load_font(33, True)
F_SMALL = load_font(21, False)
F_HOOK = load_font(76, True)
F_BODY = load_font(30, False)
F_CHIP = load_font(26, True)
F_CTA = load_font(31, True)
F_PRICE = load_font(52, True)
F_DISC = load_font(18, False)


def tw(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> int:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0]


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_w: int) -> List[str]:
    words = text.split()
    lines: List[str] = []
    cur = ''
    for word in words:
        t = word if not cur else f'{cur} {word}'
        if tw(draw, t, fnt) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def background(seed: int, tint: Tuple[int, int, int]) -> Image.Image:
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 1, RW, dtype=np.float32)[None, :]
    y = np.linspace(0, 1, RH, dtype=np.float32)[:, None]

    arr = np.zeros((RH, RW, 3), dtype=np.float32)
    arr[:, :, 0] = 4 + 8 * (1 - y)
    arr[:, :, 1] = 5 + 9 * (1 - y)
    arr[:, :, 2] = 8 + 17 * (1 - y)

    glows = [
        (0.16, 0.17, 0.24, (255, 84, 58), 0.28),
        (0.86, 0.18, 0.22, (255, 128, 104), 0.18),
        (0.22, 0.88, 0.26, tint, 0.20),
    ]
    for cx, cy, sigma, col, strength in glows:
        d2 = (x - cx) ** 2 + (y - cy) ** 2
        g = np.exp(-(d2 / (2 * sigma * sigma))) * strength
        arr[:, :, 0] += g * col[0]
        arr[:, :, 1] += g * col[1]
        arr[:, :, 2] += g * col[2]

    texture = (((x * RW * 0.04) + (y * RH * 0.03)) % 17.0) < 0.85
    arr[:, :, 0] += texture.astype(np.float32) * 7
    arr[:, :, 1] += texture.astype(np.float32) * 3
    arr[:, :, 2] += texture.astype(np.float32) * 4

    yy, xx = np.mgrid[0:RH, 0:RW]
    cx, cy = RW / 2, RH / 2
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    dmax = np.sqrt(cx * cx + cy * cy)
    vignette = 1 - 0.40 * ((d / dmax) ** 1.45)
    arr *= vignette[:, :, None]

    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGB').convert('RGBA')


def draw_header(draw: ImageDraw.ImageDraw) -> None:
    y = s(36)
    draw.rounded_rectangle((s(36), y, RW - s(36), y + s(86)), radius=s(24), fill=(8, 10, 16, 210), outline=(120, 42, 34, 230), width=s(2))

    ax, ay = s(60), y + s(16)
    draw.ellipse((ax, ay, ax + s(54), ay + s(54)), fill=(255, 84, 58, 255))
    draw.text((ax + s(15), ay + s(10)), 'S', font=F_BRAND, fill=(255, 255, 255, 255))

    draw.text((s(132), y + s(22)), 'SPECTRE', font=F_BRAND, fill=(246, 247, 250, 248))
    draw.text((s(308), y + s(28)), 'Sponsored', font=F_SMALL, fill=(175, 180, 194, 232))


def proof_line_chart(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int) -> None:
    draw.rounded_rectangle((x, y, x + w, y + h), radius=s(26), fill=(10, 12, 18, 248), outline=(112, 42, 34, 236), width=s(2))
    draw.text((x + s(20), y + s(18)), 'RISK SNAPSHOT', font=F_SMALL, fill=(255, 142, 126, 245))

    cx0, cy0 = x + s(20), y + s(66)
    cw, ch = w - s(40), h - s(86)
    for i in range(5):
        gy = cy0 + s(24) + i * s(44)
        draw.line((cx0 + s(10), gy, cx0 + cw - s(10), gy), fill=(68, 72, 88, 118), width=s(1))

    pts = []
    for i in range(10):
        px = cx0 + s(16) + i * ((cw - s(30)) / 9)
        py = cy0 + ch - s(24) - int(i * s(11)) - int(s(12) * math.sin(i * 0.68))
        pts.append((px, py))
    draw.line(pts, fill=(255, 104, 82, 255), width=s(5))
    ex, ey = pts[-1]
    draw.ellipse((ex - s(5), ey - s(5), ex + s(5), ey + s(5)), fill=(255, 142, 124, 255))


def proof_gauge(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int) -> None:
    draw.rounded_rectangle((x, y, x + w, y + h), radius=s(26), fill=(10, 12, 18, 248), outline=(112, 42, 34, 236), width=s(2))
    draw.text((x + s(20), y + s(18)), 'RISK SIGNAL', font=F_SMALL, fill=(255, 142, 126, 245))

    cx, cy = x + w // 2, y + h // 2 + s(20)
    r = s(120)
    draw.arc((cx - r, cy - r, cx + r, cy + r), start=180, end=360, fill=(70, 74, 92, 220), width=s(20))
    draw.arc((cx - r, cy - r, cx + r, cy + r), start=180, end=312, fill=(255, 96, 74, 250), width=s(20))
    draw.text((cx - tw(draw, 'LOWER RISK', F_SMALL) // 2, cy + s(30)), 'LOWER RISK', font=F_SMALL, fill=(203, 208, 221, 236))


def proof_bars(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int) -> None:
    draw.rounded_rectangle((x, y, x + w, y + h), radius=s(26), fill=(10, 12, 18, 248), outline=(112, 42, 34, 236), width=s(2))
    draw.text((x + s(20), y + s(18)), 'ASSET EXPOSURE', font=F_SMALL, fill=(255, 142, 126, 245))

    labels = ['Super', 'ASX', 'Bullion', 'Cash']
    vals = [78, 66, 44, 24]
    bx = x + s(26)
    by = y + s(84)
    for i, (label, val) in enumerate(zip(labels, vals)):
        yy = by + i * s(56)
        draw.rounded_rectangle((bx, yy, bx + s(210), yy + s(34)), radius=s(10), fill=(26, 28, 38, 245))
        fill_w = int(s(210) * val / 100)
        draw.rounded_rectangle((bx, yy, bx + fill_w, yy + s(34)), radius=s(10), fill=(255, 98, 75, 245 - i * 28))
        draw.text((bx + s(220), yy + s(5)), label, font=F_SMALL, fill=(204, 208, 220, 240))


def draw_chip(draw: ImageDraw.ImageDraw, x: int, y: int, text: str) -> None:
    x, y = s(x), s(y)
    w = tw(draw, text, F_CHIP) + s(44)
    draw.rounded_rectangle((x, y, x + w, y + s(56)), radius=s(28), fill=(11, 13, 20, 236), outline=(116, 44, 36, 228), width=s(2))
    draw.text((x + s(22), y + s(12)), text, font=F_CHIP, fill=(255, 142, 124, 246))


def draw_cta(draw: ImageDraw.ImageDraw, concept: Dict[str, object]) -> None:
    bx, by, bw, bh = s(40), s(1090), s(1000), s(220)
    draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=s(30), fill=(10, 12, 18, 240), outline=(ACCENT[0], ACCENT[1], ACCENT[2], 240), width=s(3))

    draw.text((bx + s(26), by + s(22)), str(concept['brand_line']), font=F_BRAND, fill=(255, 100, 78, 252))
    draw.text((bx + s(26), by + s(70)), str(concept['promise_short']), font=F_BODY, fill=(204, 208, 220, 236))
    draw.text((bx + s(26), by + s(154)), 'Informational analytics only. Not financial advice.', font=F_DISC, fill=(173, 176, 188, 220))

    cta_label = str(concept['cta'])
    cta_w, cta_h = s(290), s(86)
    cx, cy = bx + bw - cta_w - s(22), by + s(26)
    draw.rounded_rectangle((cx, cy, cx + cta_w, cy + cta_h), radius=s(21), fill=(255, 84, 58, 255))
    draw.text((cx + (cta_w - tw(draw, cta_label, F_CTA)) / 2, cy + s(23)), cta_label, font=F_CTA, fill=(255, 255, 255, 255))

    if 'price' in concept and concept['price']:
        draw.text((cx, by + s(128)), str(concept['price']), font=F_PRICE, fill=(255, 112, 92, 250))


def render_concept(idx: int, concept: Dict[str, object]) -> Image.Image:
    img = background(int(concept['seed']), concept['tint'])
    draw = ImageDraw.Draw(img, 'RGBA')

    draw_header(draw)

    draw.text((s(52), s(168)), str(concept['hook1']), font=F_HOOK, fill=(TEXT[0], TEXT[1], TEXT[2], 255))
    draw.text((s(52), s(242)), str(concept['hook2']), font=F_HOOK, fill=(TEXT[0], TEXT[1], TEXT[2], 255))

    body_lines = wrap(draw, str(concept['promise']), F_BODY, s(520))
    yy = s(336)
    for line in body_lines[:2]:
        draw.text((s(54), yy), line, font=F_BODY, fill=(MUTED[0], MUTED[1], MUTED[2], 238))
        yy += s(42)

    # proof block
    px, py, pw, ph = s(560), s(252), s(468), s(760)
    if concept['proof'] == 'line':
        proof_line_chart(draw, px, py, pw, ph)
    elif concept['proof'] == 'gauge':
        proof_gauge(draw, px, py, pw, ph)
    else:
        proof_bars(draw, px, py, pw, ph)

    # chips
    chip_y = 470
    for chip in concept['chips']:
        draw_chip(draw, 54, chip_y, chip)
        chip_y += 74

    draw_cta(draw, concept)

    # deterministic grain
    rng = np.random.default_rng(100 + idx)
    grain = rng.normal(0, 2, (RH, RW, 1)).astype(np.int16)
    arr = np.array(img.convert('RGB'), dtype=np.int16)
    arr = np.clip(arr + grain, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGB')


def save_outputs(images: List[Image.Image]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    feed_paths = []
    for i, hq in enumerate(images, start=1):
        hq_path = OUT_DIR / f'spectre-ig-concept-{i}-2160x2700.png'
        feed_path = OUT_DIR / f'spectre-ig-concept-{i}-1080x1350.png'
        hq.save(hq_path, format='PNG')
        hq.resize((W, H), Image.Resampling.LANCZOS).save(feed_path, format='PNG')
        feed_paths.append(feed_path)

    # quick comparison sheet
    thumb_w, thumb_h = 360, 450
    sheet = Image.new('RGB', (thumb_w * 3 + 80, thumb_h + 120), (8, 9, 14))
    sd = ImageDraw.Draw(sheet)
    label_font = load_font(18, True)
    for i, p in enumerate(feed_paths, start=1):
        thumb = Image.open(p).resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        x = 20 + (i - 1) * (thumb_w + 20)
        sheet.paste(thumb, (x, 50))
        label = f'Concept {i}'
        sd.text((x, 16), label, font=label_font, fill=(245, 246, 250))
    sheet.save(OUT_DIR / 'spectre-ig-concepts-sheet.png', format='PNG')


def main() -> None:
    concepts: List[Dict[str, object]] = [
        {
            'seed': 11,
            'tint': (102, 42, 86),
            'hook1': 'Portfolio risk.',
            'hook2': 'One workspace.',
            'promise': 'Track super, ASX, and bullion with live risk visibility.',
            'proof': 'line',
            'chips': ['Super + ASX + Bullion', 'VaR95 + Drawdown', 'Snapshot History'],
            'cta': 'Learn More',
            'brand_line': 'SPECTRE',
            'promise_short': 'Monitor exposure and risk in one private workspace.',
            'price': '$3/month Starter',
        },
        {
            'seed': 17,
            'tint': (68, 52, 104),
            'hook1': 'Know risk',
            'hook2': 'before the move.',
            'promise': 'Risk indicators surface drawdown and concentration fast.',
            'proof': 'gauge',
            'chips': ['Risk Signals', 'Concentration Alerts', 'Top Movers'],
            'cta': 'Get Started',
            'brand_line': 'SPECTRE RISK',
            'promise_short': 'Spot risk shifts before they become expensive.',
            'price': '$3/month Starter',
        },
        {
            'seed': 23,
            'tint': (120, 46, 78),
            'hook1': 'From CSV',
            'hook2': 'to clarity.',
            'promise': 'Import reports, normalize holdings, and see portfolio exposure instantly.',
            'proof': 'bars',
            'chips': ['Fast CSV Import', 'Exposure Breakdown', 'Private Workspace'],
            'cta': 'Try SPECTRE',
            'brand_line': 'SPECTRE OPS',
            'promise_short': 'Built for disciplined portfolio operations.',
            'price': '$3/month Starter',
        },
    ]

    images = [render_concept(i, concept) for i, concept in enumerate(concepts, start=1)]
    save_outputs(images)
    print(f'Done: {OUT_DIR}')


if __name__ == '__main__':
    main()
