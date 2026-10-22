#!/usr/bin/env python3
"""Seed local avatar and post media images into the simulator's Documents/watch-media directory."""

from __future__ import annotations

import argparse
import math
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT_DIR = Path(__file__).resolve().parent.parent
BUNDLE_ID = "jp.nonbili.nora"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        [
            "/System/Library/Fonts/SFNSDisplay-Bold.otf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
        if bold
        else [
            "/System/Library/Fonts/SFNS.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
        ]
    )
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def make_gradient(
    width: int,
    height: int,
    c1: tuple[int, int, int],
    c2: tuple[int, int, int],
    c3: tuple[int, int, int],
    angle: float = 0.6,
) -> Image.Image:
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    nx = x / max(1, width - 1)
    ny = y / max(1, height - 1)
    t = np.clip(nx * math.cos(angle) + ny * math.sin(angle), 0.0, 1.0)
    r = np.where(t < 0.5, c1[0] + (c2[0] - c1[0]) * (t * 2), c2[0] + (c3[0] - c2[0]) * ((t - 0.5) * 2))
    g = np.where(t < 0.5, c1[1] + (c2[1] - c1[1]) * (t * 2), c2[1] + (c3[1] - c2[1]) * ((t - 0.5) * 2))
    b = np.where(t < 0.5, c1[2] + (c2[2] - c1[2]) * (t * 2), c2[2] + (c3[2] - c2[2]) * ((t - 0.5) * 2))
    arr = np.stack([r, g, b], axis=-1).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def render_avatar(
    path: Path,
    c1: tuple[int, int, int],
    c2: tuple[int, int, int],
    c3: tuple[int, int, int],
    initials: str,
) -> None:
    size = 240
    img = make_gradient(size, size, c1, c2, c3, angle=0.75).convert("RGBA")
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse((24, 18, 170, 164), fill=(255, 255, 255, 58))
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    img = Image.alpha_composite(img, glow)

    draw = ImageDraw.Draw(img)
    draw.ellipse((8, 8, size - 9, size - 9), outline=(255, 255, 255, 70), width=4)
    font = load_font(88, bold=True)
    bbox = draw.textbbox((0, 0), initials, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - 4), initials, font=font, fill=(255, 255, 255, 245))
    img.convert("RGB").save(path, format="PNG")


def render_media_artwork(
    path: Path,
    width: int,
    height: int,
    palette: tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]],
    accent: tuple[int, int, int],
    title: str,
    subtitle: str,
    variant: int,
) -> None:
    base = make_gradient(width, height, palette[0], palette[1], palette[2], angle=0.45 + variant * 0.22).convert("RGBA")

    # Ambient orbs
    orbs = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(orbs)
    odraw.ellipse(
        (int(width * 0.08), int(height * 0.06), int(width * 0.68), int(height * 0.76)),
        fill=(*accent, 92),
    )
    odraw.ellipse(
        (int(width * 0.42), int(height * 0.24), int(width * 0.95), int(height * 0.92)),
        fill=(255, 255, 255, 52),
    )
    orbs = orbs.filter(ImageFilter.GaussianBlur(48))
    img = Image.alpha_composite(base, orbs)

    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Subtle architectural grid
    step = max(48, width // 16)
    for gx in range(step, width, step):
        draw.line([(gx, 0), (gx, height)], fill=(255, 255, 255, 16), width=1)
    for gy in range(step, height, step):
        draw.line([(0, gy), (width, gy)], fill=(255, 255, 255, 16), width=1)

    pad_x = int(width * 0.08)
    pad_y = int(height * 0.10)

    if variant % 3 == 0:
        # Layered glass UI cards
        card_w = int(width * 0.64)
        card_h = int(height * 0.56)
        x0 = pad_x
        y0 = pad_y + int(height * 0.06)
        draw.rounded_rectangle(
            (x0 + 90, y0 + 60, x0 + 90 + card_w, y0 + 60 + card_h),
            radius=32,
            fill=(15, 23, 42, 135),
            outline=(255, 255, 255, 65),
            width=2,
        )
        draw.rounded_rectangle(
            (x0, y0, x0 + card_w, y0 + card_h),
            radius=32,
            fill=(255, 255, 255, 38),
            outline=(255, 255, 255, 110),
            width=3,
        )
        # Inner bars & circles
        draw.ellipse((x0 + 36, y0 + 36, x0 + 100, y0 + 100), fill=(*accent, 230))
        draw.rounded_rectangle((x0 + 124, y0 + 44, x0 + card_w - 60, y0 + 68), radius=12, fill=(255, 255, 255, 215))
        draw.rounded_rectangle((x0 + 124, y0 + 80, x0 + card_w - 150, y0 + 98), radius=9, fill=(255, 255, 255, 130))
        for i in range(3):
            bx = x0 + 36 + i * int((card_w - 72) / 3)
            bw = int((card_w - 108) / 3)
            draw.rounded_rectangle(
                (bx, y0 + 136, bx + bw, y0 + card_h - 40),
                radius=20,
                fill=(255, 255, 255, 32 + i * 18),
                outline=(255, 255, 255, 70),
                width=2,
            )
    elif variant % 3 == 1:
        # Geometric concentric rings & studio light beam
        cx, cy = int(width * 0.52), int(height * 0.46)
        for idx, r in enumerate([int(min(width, height) * 0.34), int(min(width, height) * 0.25), int(min(width, height) * 0.16)]):
            draw.ellipse(
                (cx - r, cy - r, cx + r, cy + r),
                fill=(255, 255, 255, 22 + idx * 24),
                outline=(255, 255, 255, 95),
                width=3,
            )
        draw.ellipse((cx - 46, cy - 46, cx + 46, cy + 46), fill=(*accent, 240))
    else:
        # Editorial split panels
        w_half = int((width - pad_x * 2 - 28) / 2)
        h_box = int(height * 0.54)
        draw.rounded_rectangle(
            (pad_x, pad_y + 20, pad_x + w_half, pad_y + 20 + h_box),
            radius=28,
            fill=(255, 255, 255, 42),
            outline=(255, 255, 255, 105),
            width=3,
        )
        draw.rounded_rectangle(
            (pad_x + w_half + 28, pad_y + 60, pad_x + w_half * 2 + 28, pad_y + 60 + h_box),
            radius=28,
            fill=(15, 23, 42, 145),
            outline=(*accent, 180),
            width=3,
        )
        draw.ellipse(
            (pad_x + 42, pad_y + 62, pad_x + w_half - 42, pad_y + 62 + (w_half - 84)),
            fill=(*accent, 210),
        )

    # Bottom caption pill
    pill_y0 = height - int(height * 0.22)
    pill_y1 = height - int(height * 0.07)
    draw.rounded_rectangle(
        (pad_x, pill_y0, width - pad_x, pill_y1),
        radius=24,
        fill=(9, 9, 11, 168),
        outline=(255, 255, 255, 65),
        width=2,
    )
    f_title = load_font(max(24, int(height * 0.038)), bold=True)
    f_sub = load_font(max(18, int(height * 0.025)), bold=False)
    draw.text((pad_x + 28, pill_y0 + int((pill_y1 - pill_y0) * 0.18)), title, font=f_title, fill=(255, 255, 255, 245))
    draw.text((pad_x + 28, pill_y0 + int((pill_y1 - pill_y0) * 0.58)), subtitle, font=f_sub, fill=(212, 212, 216, 220))

    out = Image.alpha_composite(img, overlay).convert("RGB")
    out.save(path, format="PNG")


def seed_media_directory(media_dir: Path) -> None:
    media_dir.mkdir(parents=True, exist_ok=True)

    avatars = [
        ("avatar-lena.png", (79, 70, 229), (124, 58, 237), (236, 72, 153), "LV"),
        ("avatar-kuro.png", (15, 23, 42), (30, 64, 175), (56, 189, 248), "KT"),
        ("avatar-atelier.png", (180, 83, 9), (217, 119, 6), (251, 191, 36), "AN"),
        ("avatar-webdev.png", (6, 95, 70), (16, 185, 129), (52, 211, 153), "WD"),
        ("avatar-webkit.png", (30, 58, 138), (59, 130, 246), (147, 197, 253), "WP"),
        ("avatar-maya.png", (157, 23, 77), (225, 29, 72), (251, 113, 133), "ML"),
        ("avatar-minimal.png", (39, 39, 42), (82, 82, 91), (161, 161, 170), "MN"),
        ("avatar-motion.png", (88, 28, 135), (147, 51, 234), (192, 132, 252), "MC"),
    ]
    for filename, c1, c2, c3, initials in avatars:
        render_avatar(media_dir / filename, c1, c2, c3, initials)

    artworks = [
        (
            "media-01-glass.png",
            1200,
            900,
            ((30, 27, 75), (67, 56, 202), (14, 165, 233)),
            (129, 140, 248),
            "Tactile Glass & Ambient Surfaces",
            "Design System 4.0 · Material & Depth Study",
            0,
        ),
        (
            "media-02-palette.png",
            1200,
            900,
            ((49, 16, 66), (126, 34, 206), (236, 72, 153)),
            (244, 114, 182),
            "Dynamic Tonal Tokens",
            "High-Contrast Dark & Light Adaptive Ramps",
            1,
        ),
        (
            "media-03-compositor.png",
            1200,
            750,
            ((15, 23, 42), (3, 105, 161), (34, 211, 238)),
            (56, 189, 248),
            "120Hz Compositor Spring Physics",
            "Scroll-Driven View Transitions on WebKit & Blink",
            2,
        ),
        (
            "media-04-studio.png",
            1080,
            1080,
            ((69, 26, 3), (180, 83, 9), (245, 158, 11)),
            (251, 191, 36),
            "Copenhagen Daylight Studio",
            "Birch Plywood · Brushed Aluminum · Warm North Light",
            3,
        ),
        (
            "media-05-architect.png",
            1080,
            1080,
            ((24, 24, 27), (63, 63, 70), (161, 161, 170)),
            (228, 228, 231),
            "Nordic Architectural Grid",
            "Monolithic Concrete & Natural Oak Proportions",
            4,
        ),
        (
            "media-06-ceramics.png",
            1080,
            1080,
            ((67, 20, 7), (154, 52, 18), (251, 146, 60)),
            (253, 186, 116),
            "Hand-Thrown Stoneware Vessels",
            "Matte Glaze Texture Series · Autumn Collection",
            5,
        ),
        (
            "media-07-workflow.png",
            1200,
            800,
            ((17, 24, 39), (49, 46, 129), (16, 185, 129)),
            (52, 211, 153),
            "Calm Multi-Profile Social Workspace",
            "Isolated Sessions · Custom Timelines · Zero Algorithmic Noise",
            6,
        ),
        (
            "media-08-architecture.png",
            1200,
            750,
            ((6, 78, 59), (5, 150, 105), (45, 212, 191)),
            (110, 231, 183),
            "Local-First SQLite + MMKV Engine",
            "Sub-Millisecond Feed Queries & Offline Media Cache",
            7,
        ),
        (
            "media-09-colorstudy.png",
            1080,
            1080,
            ((76, 5, 25), (190, 18, 60), (251, 113, 133)),
            (253, 164, 175),
            "Color Study #42 — Sunset Coral",
            "Luminous Pigments on Matte Obsidian Canvas",
            8,
        ),
        (
            "media-10-motion.png",
            1080,
            1080,
            ((46, 16, 101), (109, 40, 217), (192, 132, 252)),
            (216, 180, 254),
            "Gesture & Spring Curve Choreography",
            "60fps Interactive Card Physics Breakdown",
            9,
        ),
        (
            "media-11-minimal.png",
            1200,
            800,
            ((24, 24, 27), (39, 39, 42), (99, 102, 241)),
            (165, 180, 252),
            "Intentional Digital Environment",
            "One Calm Reader in Place of Eight Noisy Apps",
            10,
        ),
    ]
    for filename, w, h, palette, accent, title, subtitle, variant in artworks:
        render_media_artwork(media_dir / filename, w, h, palette, accent, title, subtitle, variant)

    blocklist_dir = media_dir.parent / "blocklist"
    blocklist_dir.mkdir(parents=True, exist_ok=True)
    for src_name in (
        "easylist.txt",
        "easyprivacy.txt",
        "brave-firstparty.txt",
        "brave-firstparty-regional.txt",
    ):
        (blocklist_dir / src_name).write_text("||doubleclick.net^\n||google-analytics.com^\n", encoding="utf-8")
    (blocklist_dir / "matcher.json").write_text(
        '{"revision":14,"parserVersion":2,"blockedHosts":"doubleclick.net\\ngoogle-analytics.com","allowedHosts":""}',
        encoding="utf-8",
    )



def get_app_data_container(udid: str, bundle_id: str) -> Path:
    res = subprocess.run(
        ["xcrun", "simctl", "get_app_container", udid, bundle_id, "data"],
        check=True,
        capture_output=True,
        text=True,
    )
    return Path(res.stdout.strip())


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed local watch-media files for Nora preview.")
    parser.add_argument("--udid", help="Simulator UDID to seed")
    parser.add_argument("--bundle-id", default=BUNDLE_ID, help="App bundle identifier")
    parser.add_argument("--output-dir", type=Path, help="Optional direct directory path instead of simulator container")
    args = parser.parse_args()

    if args.output_dir:
        target_dir = args.output_dir
    elif args.udid:
        container = get_app_data_container(args.udid, args.bundle_id)
        target_dir = container / "Documents" / "watch-media"
    else:
        parser.error("Provide either --udid or --output-dir")

    seed_media_directory(target_dir)
    print(f"Seeded {len(list(target_dir.glob('*.png')))} media files in {target_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
