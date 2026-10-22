#!/usr/bin/env python3
"""Render Google Play promotional motion graphics from committed UI screenshots.

Outputs: 20-second, 30 fps H.264 landscape (1920x1080) and portrait (1080x1920)
videos in fastlane/videos/android/en-US/. For iOS App Store previews made from
actual simulator recordings, use scripts/generate-app-previews.py instead.

See fastlane/videos/README.md for setup and usage.
"""

import argparse
from contextlib import contextmanager, nullcontext
import math
import os
import shutil
import subprocess
import sys
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT_DIR / "fastlane" / "videos" / "assets"
OUT_ROOT = ROOT_DIR / "fastlane" / "videos"
ICON_PATH = ROOT_DIR / "assets" / "images" / "icon.png"

FPS = 30
DURATION_SEC = 20.0
TOTAL_FRAMES = int(FPS * DURATION_SEC)  # 600 frames


# ---------------------------------------------------------------------------
# Easing & math helpers
# ---------------------------------------------------------------------------

def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def ease_out_cubic(t: float) -> float:
    t = clamp(t)
    return 1.0 - (1.0 - t) ** 3


def ease_out_expo(t: float) -> float:
    t = clamp(t)
    return 1.0 if t >= 1.0 else 1.0 - pow(2.0, -10.0 * t)


def ease_in_out_cubic(t: float) -> float:
    t = clamp(t)
    if t < 0.5:
        return 4.0 * t * t * t
    return 1.0 - ((-2.0 * t + 2.0) ** 3) / 2.0


def ease_out_back(t: float, overshoot: float = 1.35) -> float:
    t = clamp(t)
    c1 = overshoot
    c3 = c1 + 1.0
    return 1.0 + c3 * pow(t - 1.0, 3) + c1 * pow(t - 1.0, 2)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge1 == edge0:
        return 0.0
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp_color(
    c1: Tuple[int, int, int], c2: Tuple[int, int, int], t: float
) -> Tuple[int, int, int]:
    t = clamp(t)
    return (
        int(round(c1[0] + (c2[0] - c1[0]) * t)),
        int(round(c1[1] + (c2[1] - c1[1]) * t)),
        int(round(c1[2] + (c2[2] - c1[2]) * t)),
    )


# ---------------------------------------------------------------------------
# Font loading
# ---------------------------------------------------------------------------

FONT_CANDIDATES_BOLD = [
    "/System/Library/Fonts/SFNSDisplay-Bold.otf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "DejaVuSans-Bold.ttf",
]

FONT_CANDIDATES_REGULAR = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "DejaVuSans.ttf",
]


@lru_cache(maxsize=128)
def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = FONT_CANDIDATES_BOLD if bold else FONT_CANDIDATES_REGULAR
    for path in candidates:
        try:
            font = ImageFont.truetype(path, size=size)
        except OSError:
            continue
        try:
            font.set_variation_by_name("Bold" if bold else "Regular")
        except (OSError, ValueError, AttributeError):
            pass
        return font
    return ImageFont.load_default(size=size)


# ---------------------------------------------------------------------------
# Framed Device & Callout Builders
# ---------------------------------------------------------------------------

def create_rounded_mask(size: Tuple[int, int], radius: int) -> Image.Image:
    w, h = size
    scale = 2
    mask_hi = Image.new("L", (w * scale, h * scale), 0)
    draw = ImageDraw.Draw(mask_hi)
    draw.rounded_rectangle(
        (0, 0, w * scale - 1, h * scale - 1),
        radius=radius * scale,
        fill=255,
    )
    return mask_hi.resize((w, h), Image.Resampling.LANCZOS)


def build_framed_device(
    screen_img: Image.Image,
    target_screen_w: int,
    target_screen_h: int,
    is_tablet: bool = False,
    accent_rgb: Tuple[int, int, int] = (99, 102, 241),
) -> Image.Image:
    """
    Wraps a screenshot inside a sleek metallic bezel with rounded screen corners,
    subtle glass edge rim, and soft ambient drop shadow.
    """
    screen = screen_img.convert("RGBA").resize(
        (target_screen_w, target_screen_h), Image.Resampling.LANCZOS
    )

    bezel = max(8, int(round(target_screen_w * (0.028 if is_tablet else 0.032))))
    corner_r = int(round(target_screen_w * (0.048 if is_tablet else 0.095)))
    outer_r = corner_r + bezel

    body_w = target_screen_w + bezel * 2
    body_h = target_screen_h + bezel * 2

    pad = int(round(max(body_w, body_h) * 0.075))
    canvas_w = body_w + pad * 2
    canvas_h = body_h + pad * 2

    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    # Colored ambient underglow + deep drop shadow
    shadow = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    shadow_offset_y = int(round(pad * 0.22))
    sdraw.rounded_rectangle(
        (
            pad + 2,
            pad + shadow_offset_y,
            pad + body_w - 2,
            pad + body_h + shadow_offset_y - 2,
        ),
        radius=outer_r,
        fill=(0, 0, 0, 175),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(10, int(pad * 0.36))))
    canvas = Image.alpha_composite(canvas, shadow)

    # Metallic titanium chassis
    body = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(body)
    bdraw.rounded_rectangle(
        (pad, pad, pad + body_w - 1, pad + body_h - 1),
        radius=outer_r,
        fill=(24, 26, 33, 255),
        outline=(92, 100, 118, 220),
        width=max(2, bezel // 5),
    )
    bdraw.rounded_rectangle(
        (pad + 3, pad + 3, pad + body_w - 4, pad + body_h - 4),
        radius=max(4, outer_r - 3),
        outline=(accent_rgb[0], accent_rgb[1], accent_rgb[2], 70),
        width=1,
    )
    canvas = Image.alpha_composite(canvas, body)

    # Rounded screen
    screen_mask = create_rounded_mask((target_screen_w, target_screen_h), corner_r)
    screen_with_alpha = Image.new("RGBA", (target_screen_w, target_screen_h), (0, 0, 0, 0))
    screen_with_alpha.paste(screen, (0, 0), screen_mask)

    # Subtle diagonal glass sheen
    gloss = Image.new("RGBA", (target_screen_w, target_screen_h), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(gloss)
    gdraw.polygon(
        [
            (0, 0),
            (int(target_screen_w * 0.62), 0),
            (int(target_screen_w * 0.22), target_screen_h),
            (0, target_screen_h),
        ],
        fill=(255, 255, 255, 8),
    )
    gloss_masked = Image.new("RGBA", (target_screen_w, target_screen_h), (0, 0, 0, 0))
    gloss_masked.paste(gloss, (0, 0), screen_mask)
    screen_with_alpha = Image.alpha_composite(screen_with_alpha, gloss_masked)

    canvas.alpha_composite(screen_with_alpha, dest=(pad + bezel, pad + bezel))

    # Home indicator pill at bottom
    indicator = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(indicator)
    ind_w = int(round(target_screen_w * (0.24 if is_tablet else 0.34)))
    ind_h = max(4, int(round(target_screen_h * 0.0055)))
    ind_x = pad + bezel + (target_screen_w - ind_w) // 2
    ind_y = pad + bezel + target_screen_h - int(round(target_screen_h * 0.015))
    idraw.rounded_rectangle(
        (ind_x, ind_y, ind_x + ind_w, ind_y + ind_h),
        radius=ind_h // 2,
        fill=(255, 255, 255, 115),
    )
    canvas = Image.alpha_composite(canvas, indicator)
    return canvas


def build_zoom_callout_card(
    source_img: Image.Image,
    crop_box_norm: Tuple[float, float, float, float],
    target_w: int,
    accent_rgb: Tuple[int, int, int],
    label: Optional[str] = None,
) -> Image.Image:
    """
    Crops a feature region from a retina UI screenshot and wraps it in a
    floating glass elevation card with glowing accent border.
    """
    sw, sh = source_img.size
    x0 = int(round(crop_box_norm[0] * sw))
    y0 = int(round(crop_box_norm[1] * sh))
    x1 = int(round(crop_box_norm[2] * sw))
    y1 = int(round(crop_box_norm[3] * sh))
    cropped = source_img.crop((x0, y0, x1, y1)).convert("RGBA")

    aspect = (y1 - y0) / max(1, (x1 - x0))
    target_h = int(round(target_w * aspect))
    cropped = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)

    corner_r = max(14, int(round(min(target_w, target_h) * 0.14)))
    pad = max(18, int(round(target_w * 0.07)))
    label_h = int(round(target_w * 0.095)) if label else 0

    cw = target_w + pad * 2
    ch = target_h + pad * 2 + label_h
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))

    # Drop shadow
    shd = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shd)
    sdraw.rounded_rectangle(
        (pad, pad + label_h + 6, pad + target_w, pad + label_h + target_h + 6),
        radius=corner_r,
        fill=(0, 0, 0, 185),
    )
    shd = shd.filter(ImageFilter.GaussianBlur(radius=max(8, pad // 2)))
    card = Image.alpha_composite(card, shd)

    # Masked crop
    mask = create_rounded_mask((target_w, target_h), corner_r)
    inner = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    inner.paste(cropped, (0, 0), mask)
    card.alpha_composite(inner, dest=(pad, pad + label_h))

    # Glowing border around cropped card
    bdr = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(bdr)
    bdraw.rounded_rectangle(
        (pad - 1, pad + label_h - 1, pad + target_w + 1, pad + label_h + target_h + 1),
        radius=corner_r + 1,
        outline=(accent_rgb[0], accent_rgb[1], accent_rgb[2], 215),
        width=2,
    )

    if label:
        font = load_font(max(13, int(round(target_w * 0.043))), bold=True)
        bbox = bdraw.textbbox((0, 0), label, font=font)
        cap_box = bdraw.textbbox((0, 0), "H", font=font)
        tw = bbox[2] - bbox[0]
        cap_h = cap_box[3] - cap_box[1]
        pill_w = tw + 28
        pill_h = cap_h + 20
        px = pad + 8
        py = max(4, pad + label_h - pill_h - 6)
        bdraw.rounded_rectangle(
            (px, py, px + pill_w, py + pill_h),
            radius=pill_h // 2,
            fill=(16, 20, 28, 235),
            outline=(accent_rgb[0], accent_rgb[1], accent_rgb[2], 200),
            width=2,
        )
        tx = px + (pill_w - tw) / 2.0 - bbox[0]
        ty = py + (pill_h - cap_h) / 2.0 - cap_box[1]
        bdraw.text(
            (tx, ty),
            label,
            font=font,
            fill=(245, 250, 255, 255),
        )

    card = Image.alpha_composite(card, bdr)
    return card


def build_floating_pill(
    text: str,
    accent_rgb: Tuple[int, int, int],
    font_size: int = 22,
    filled: bool = False,
) -> Image.Image:
    font = load_font(font_size, bold=True)
    dummy = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    bbox = dummy.textbbox((0, 0), text, font=font)
    cap_box = dummy.textbbox((0, 0), "H", font=font)
    tw = bbox[2] - bbox[0]
    cap_h = cap_box[3] - cap_box[1]

    pad_x = int(round(font_size * 0.85))
    pad_y = int(round(font_size * 0.55))
    pw = tw + pad_x * 2
    ph = cap_h + pad_y * 2
    margin = 14

    img = Image.new("RGBA", (pw + margin * 2, ph + margin * 2), (0, 0, 0, 0))
    shd = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shd)
    sdraw.rounded_rectangle(
        (margin, margin + 4, margin + pw, margin + ph + 4),
        radius=ph // 2,
        fill=(0, 0, 0, 140),
    )
    shd = shd.filter(ImageFilter.GaussianBlur(radius=6))
    img = Image.alpha_composite(img, shd)

    draw = ImageDraw.Draw(img)
    bg_fill = (
        (accent_rgb[0], accent_rgb[1], accent_rgb[2], 235)
        if filled
        else (18, 22, 32, 230)
    )
    border_col = (
        (255, 255, 255, 190)
        if filled
        else (accent_rgb[0], accent_rgb[1], accent_rgb[2], 220)
    )
    draw.rounded_rectangle(
        (margin, margin, margin + pw, margin + ph),
        radius=ph // 2,
        fill=bg_fill,
        outline=border_col,
        width=2,
    )
    tx = margin + (pw - tw) / 2.0 - bbox[0]
    ty = margin + (ph - cap_h) / 2.0 - cap_box[1]
    draw.text(
        (tx, ty),
        text,
        font=font,
        fill=(255, 255, 255, 255),
    )
    return img


# ---------------------------------------------------------------------------
# Dynamic Background Generator
# ---------------------------------------------------------------------------

def make_background(
    width: int,
    height: int,
    t_global: float,
    accent1: Tuple[int, int, int],
    accent2: Tuple[int, int, int],
) -> Image.Image:
    """
    Renders a rich dark atmospheric background with drifting aurora mesh glows.
    """
    scale = 4
    sw = max(32, width // scale)
    sh = max(32, height // scale)

    y_norm = np.linspace(0.0, 1.0, sh, dtype=np.float32)[:, None]
    x_norm = np.linspace(0.0, 1.0, sw, dtype=np.float32)[None, :]

    # Deep obsidian base
    r = 7.0 + 7.0 * (1.0 - y_norm)
    g = 9.0 + 10.0 * (1.0 - y_norm)
    b = 16.0 + 18.0 * (1.0 - y_norm)

    # Drifting primary aurora orb
    cx1 = 0.25 + 0.22 * math.sin(t_global * 0.55)
    cy1 = 0.24 + 0.14 * math.cos(t_global * 0.42)
    d1_sq = (x_norm - cx1) ** 2 + ((y_norm - cy1) * (height / width)) ** 2
    glow1 = np.exp(-d1_sq / 0.16) * 0.34

    # Drifting secondary aurora orb
    cx2 = 0.76 + 0.18 * math.cos(t_global * 0.48 + 1.1)
    cy2 = 0.72 + 0.15 * math.sin(t_global * 0.38 + 0.6)
    d2_sq = (x_norm - cx2) ** 2 + ((y_norm - cy2) * (height / width)) ** 2
    glow2 = np.exp(-d2_sq / 0.20) * 0.28

    r = np.clip(r + glow1 * accent1[0] + glow2 * accent2[0], 0, 255)
    g = np.clip(g + glow1 * accent1[1] + glow2 * accent2[1], 0, 255)
    b = np.clip(b + glow1 * accent1[2] + glow2 * accent2[2], 0, 255)

    arr = np.stack([r, g, b], axis=-1).astype(np.uint8)
    bg = Image.fromarray(arr).resize(
        (width, height), Image.Resampling.BICUBIC
    )
    return bg.convert("RGBA")


# ---------------------------------------------------------------------------
# Transform & Composite Helper
# ---------------------------------------------------------------------------

def paste_transformed(
    canvas: Image.Image,
    sprite: Image.Image,
    center_xy: Tuple[float, float],
    scale: float = 1.0,
    angle_deg: float = 0.0,
    opacity: float = 1.0,
) -> None:
    if opacity <= 0.01 or scale <= 0.02:
        return

    w, h = sprite.size
    new_w = max(2, int(round(w * scale)))
    new_h = max(2, int(round(h * scale)))
    img = sprite.resize((new_w, new_h), Image.Resampling.BICUBIC)

    if abs(angle_deg) > 0.08:
        img = img.rotate(angle_deg, resample=Image.Resampling.BICUBIC, expand=True)

    if opacity < 0.995:
        r, g, b, a = img.split()
        a = a.point(lambda p: int(round(p * clamp(opacity))))
        img = Image.merge("RGBA", (r, g, b, a))

    px = int(round(center_xy[0] - img.width / 2.0))
    py = int(round(center_xy[1] - img.height / 2.0))
    canvas.alpha_composite(img, dest=(px, py))


def blend_diagonal_wipe(
    img_a: Image.Image,
    img_b: Image.Image,
    progress: float,
    accent_rgb: Tuple[int, int, int],
) -> Image.Image:
    """
    Blends two framed device images with a sleek diagonal wipe transition.
    """
    p = clamp(progress)
    if p <= 0.005:
        return img_a
    if p >= 0.995:
        return img_b

    w, h = img_a.size
    mw, mh = max(16, w // 2), max(16, h // 2)
    yy = np.linspace(0.0, 1.0, mh, dtype=np.float32)[:, None]
    xx = np.linspace(0.0, 1.0, mw, dtype=np.float32)[None, :]
    diag = (xx * 0.75 + yy * 0.25)
    edge = lerp(-0.12, 1.12, p)
    feather = 0.045
    alpha_norm = np.clip((edge - diag) / feather, 0.0, 1.0)
    mask = Image.fromarray((alpha_norm * 255).astype(np.uint8)).resize(
        (w, h), Image.Resampling.BILINEAR
    )

    out = Image.composite(img_b, img_a, mask)
    return out


# ---------------------------------------------------------------------------
# Scene Definitions & Copy
# ---------------------------------------------------------------------------

SCENES = [
    {
        "badge": "All-in-One Social Browser",
        "title": "Every social feed.\nOne calm home.",
        "subtitle": "Bluesky, X, Instagram, Reddit, Threads, Mastodon & more.",
        "accent1": (99, 102, 241),
        "accent2": (56, 189, 248),
    },
    {
        "badge": "Feed Reader & Timelines",
        "title": "Follow without\nthe algorithm.",
        "subtitle": "Group accounts into custom timelines with unread counts.",
        "accent1": (16, 185, 129),
        "accent2": (99, 102, 241),
    },
    {
        "badge": "Media Grid & Sources",
        "title": "Visual grids.\nFull control.",
        "subtitle": "Browse photo & video grids, filter sources, and sync OPML.",
        "accent1": (245, 158, 11),
        "accent2": (236, 72, 153),
    },
    {
        "badge": "Multi-Account Profiles",
        "title": "Separate profiles.\nIsolated sessions.",
        "subtitle": "Dedicated cookies for Default, Work, Personal, or per site.",
        "accent1": (244, 63, 94),
        "accent2": (168, 85, 247),
    },
    {
        "badge": "Blocklist, CSS & Tabs",
        "title": "Built for power.\nYours to shape.",
        "subtitle": "Ad & tracker blocklist, custom CSS & JS, and multi-tab views.",
        "accent1": (56, 189, 248),
        "accent2": (99, 102, 241),
    },
]


# ---------------------------------------------------------------------------
# Typography & HUD Overlay Renderer
# ---------------------------------------------------------------------------

def draw_scene_copy(
    canvas: Image.Image,
    scene: Dict,
    scene_t: float,
    scene_idx: int,
    is_landscape: bool,
    icon_img: Image.Image,
) -> None:
    w, h = canvas.size
    enter_p = ease_out_cubic((scene_t + (0.55 if scene_idx == 0 else 0.0)) / 0.55)
    exit_p = (1.0 - ease_in_out_cubic((scene_t - 3.45) / 0.55)
              if scene_t > 3.45 and scene_idx < len(SCENES) - 1 else 1.0)
    alpha_mult = clamp(enter_p * exit_p)
    slide_y = int(round((1.0 - enter_p) * 26 - (1.0 - exit_p) * 18))

    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    accent = scene["accent1"]

    if is_landscape:
        left_x = int(round(w * 0.065))
        top_y = int(round(h * 0.16)) + slide_y
        max_text_w = int(round(w * 0.40))

        # Brand row
        icon_sz = int(round(h * 0.068))
        icon_resized = icon_img.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        icon_mask = create_rounded_mask((icon_sz, icon_sz), int(icon_sz * 0.24))
        layer.paste(icon_resized, (left_x, top_y), icon_mask)

        brand_font = load_font(int(round(h * 0.036)), bold=True)
        bb_brand = draw.textbbox((0, 0), "Nora", font=brand_font)
        cap_brand = draw.textbbox((0, 0), "H", font=brand_font)
        cap_h_brand = cap_brand[3] - cap_brand[1]
        draw.text(
            (left_x + icon_sz + 16 - bb_brand[0], top_y + (icon_sz - cap_h_brand) / 2.0 - cap_brand[1]),
            "Nora",
            font=brand_font,
            fill=(255, 255, 255, int(245 * alpha_mult)),
        )

        # Badge pill
        badge_y = top_y + icon_sz + int(round(h * 0.045))
        badge_font = load_font(int(round(h * 0.022)), bold=True)
        badge_text = scene["badge"]
        bb = draw.textbbox((0, 0), badge_text, font=badge_font)
        cap_b = draw.textbbox((0, 0), "H", font=badge_font)
        tw_b = bb[2] - bb[0]
        cap_h_b = cap_b[3] - cap_b[1]
        bw = tw_b + 32
        bh = cap_h_b + 20
        draw.rounded_rectangle(
            (left_x, badge_y, left_x + bw, badge_y + bh),
            radius=bh // 2,
            fill=(accent[0], accent[1], accent[2], int(42 * alpha_mult)),
            outline=(accent[0], accent[1], accent[2], int(210 * alpha_mult)),
            width=2,
        )
        draw.text(
            (left_x + (bw - tw_b) / 2.0 - bb[0], badge_y + (bh - cap_h_b) / 2.0 - cap_b[1]),
            badge_text,
            font=badge_font,
            fill=(238, 242, 255, int(255 * alpha_mult)),
        )

        # Title
        title_font = load_font(int(round(h * 0.076)), bold=True)
        title_y = badge_y + bh + int(round(h * 0.028))
        draw.multiline_text(
            (left_x, title_y),
            scene["title"],
            font=title_font,
            fill=(255, 255, 255, int(255 * alpha_mult)),
            spacing=int(round(h * 0.010)),
        )
        tb = draw.multiline_textbbox(
            (left_x, title_y),
            scene["title"],
            font=title_font,
            spacing=int(round(h * 0.010)),
        )

        # Subtitle wrapped
        sub_font = load_font(int(round(h * 0.032)), bold=False)
        sub_y = tb[3] + int(round(h * 0.026))
        words = scene["subtitle"].split()
        lines: List[str] = []
        cur = ""
        for word in words:
            test = f"{cur} {word}".strip()
            wbox = draw.textbbox((0, 0), test, font=sub_font)
            if wbox[2] - wbox[0] <= max_text_w or not cur:
                cur = test
            else:
                lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        draw.multiline_text(
            (left_x, sub_y),
            "\n".join(lines),
            font=sub_font,
            fill=(186, 196, 214, int(235 * alpha_mult)),
            spacing=8,
        )

        # Scene progress dots
        dots_y = int(round(h * 0.86))
        dot_x = left_x
        for i in range(len(SCENES)):
            is_cur = i == scene_idx
            dw = 38 if is_cur else 10
            col = (
                (accent[0], accent[1], accent[2], 245)
                if is_cur
                else (255, 255, 255, 70)
            )
            draw.rounded_rectangle(
                (dot_x, dots_y, dot_x + dw, dots_y + 10),
                radius=5,
                fill=col,
            )
            dot_x += dw + 10
    else:
        # Portrait header layout
        cx = w // 2
        top_y = int(round(h * 0.042)) + slide_y

        # Brand + Badge row
        badge_font = load_font(max(16, int(round(w * 0.024))), bold=True)
        badge_text = f"Nora  •  {scene['badge']}"
        bb = draw.textbbox((0, 0), badge_text, font=badge_font)
        cap_b = draw.textbbox((0, 0), "H", font=badge_font)
        tw_badge = bb[2] - bb[0]
        cap_h_badge = cap_b[3] - cap_b[1]
        bh = cap_h_badge + 24

        icon_sz = bh - 10
        pad_left = 6
        gap = 12
        pad_right = 18
        total_pill_w = pad_left + icon_sz + gap + tw_badge + pad_right
        px = cx - total_pill_w // 2

        draw.rounded_rectangle(
            (px, top_y, px + total_pill_w, top_y + bh),
            radius=bh // 2,
            fill=(16, 20, 30, int(215 * alpha_mult)),
            outline=(accent[0], accent[1], accent[2], int(210 * alpha_mult)),
            width=2,
        )
        icon_resized = icon_img.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        icon_mask = create_rounded_mask((icon_sz, icon_sz), icon_sz // 2)
        layer.paste(icon_resized, (px + pad_left, top_y + (bh - icon_sz) // 2), icon_mask)

        tx_badge = px + pad_left + icon_sz + gap - bb[0]
        ty_badge = top_y + (bh - cap_h_badge) / 2.0 - cap_b[1]
        draw.text(
            (tx_badge, ty_badge),
            badge_text,
            font=badge_font,
            fill=(240, 244, 255, int(255 * alpha_mult)),
        )

        # Headline
        title_font = load_font(max(32, int(round(w * 0.070))), bold=True)
        title_to_draw = scene["title"]

        title_y = top_y + bh + int(round(h * 0.014))
        tb_multi = draw.multiline_textbbox(
            (0, 0), title_to_draw, font=title_font, align="center", spacing=6
        )
        tw = tb_multi[2] - tb_multi[0]
        draw.multiline_text(
            (cx - tw // 2, title_y),
            title_to_draw,
            font=title_font,
            fill=(255, 255, 255, int(255 * alpha_mult)),
            align="center",
            spacing=6,
        )

        # Subtitle
        sub_font = load_font(max(18, int(round(w * 0.035))), bold=False)
        sub_y = title_y + tb_multi[3] + int(round(h * 0.014))
        max_sub_w = int(round(w * 0.84))
        words = scene["subtitle"].split()
        lines = []
        cur = ""
        for word in words:
            test = f"{cur} {word}".strip()
            wbox = draw.textbbox((0, 0), test, font=sub_font)
            if wbox[2] - wbox[0] <= max_sub_w or not cur:
                cur = test
            else:
                lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        sub_text = "\n".join(lines)
        sb = draw.multiline_textbbox((0, 0), sub_text, font=sub_font, align="center", spacing=4)
        sw = sb[2] - sb[0]
        draw.multiline_text(
            (cx - sw // 2, sub_y),
            sub_text,
            font=sub_font,
            fill=(190, 200, 218, int(235 * alpha_mult)),
            align="center",
            spacing=4,
        )

        # Progress pills at bottom
        dots_y = int(round(h * 0.962))
        total_dots_w = (len(SCENES) - 1) * 10 + 36 + (len(SCENES) - 1) * 10
        dot_x = cx - total_dots_w // 2
        for i in range(len(SCENES)):
            is_cur = i == scene_idx
            dw = 36 if is_cur else 10
            col = (
                (accent[0], accent[1], accent[2], 245)
                if is_cur
                else (255, 255, 255, 70)
            )
            draw.rounded_rectangle(
                (dot_x, dots_y, dot_x + dw, dots_y + 8),
                radius=4,
                fill=col,
            )
            dot_x += dw + 10

    canvas.alpha_composite(layer)


# ---------------------------------------------------------------------------
# Target Video Renderers
# ---------------------------------------------------------------------------

@contextmanager
def video_encoder(ffmpeg_cmd: List[str], out_path: Path):
    """Keep diagnostics off pipes and publish only a completed encode."""
    with tempfile.TemporaryDirectory(prefix=".promo-", dir=out_path.parent) as work_dir:
        staging_path = Path(work_dir) / out_path.name
        with tempfile.TemporaryFile() as diagnostics:
            proc = subprocess.Popen(
                [*ffmpeg_cmd, str(staging_path)],
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=diagnostics,
            )
            try:
                assert proc.stdin is not None
                try:
                    yield proc.stdin
                    proc.stdin.close()
                except BrokenPipeError:
                    pass
                ret = proc.wait()
                if ret != 0:
                    diagnostics.seek(0)
                    details = diagnostics.read().decode("utf-8", errors="replace")
                    raise RuntimeError(f"ffmpeg failed for {out_path.name} (exit {ret}):\n{details}")
                staging_path.replace(out_path)
            finally:
                if proc.poll() is None:
                    proc.kill()
                proc.wait()
                if proc.stdin is not None:
                    try:
                        proc.stdin.close()
                    except BrokenPipeError:
                        pass


def render_video_target(
    name: str,
    width: int,
    height: int,
    device_kind: str,  # "phone" or "tablet"
    out_path: Path,
    raw_screens: Dict[str, Image.Image],
    icon_img: Image.Image,
    preview_dir: Optional[Path] = None,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    is_landscape = width > height
    is_tablet = device_kind == "tablet"

    if is_landscape:
        base_screen_h = int(round(height * 0.76))
        base_screen_w = int(round(base_screen_h * (393.0 / 852.0)))
    elif is_tablet:
        base_screen_h = int(round(height * 0.60))
        base_screen_w = int(round(base_screen_h * (682.0 / 910.0)))
    else:
        base_screen_h = int(round(height * 0.68))
        base_screen_w = int(round(base_screen_h * (393.0 / 852.0)))
        if base_screen_w > int(width * 0.78):
            base_screen_w = int(round(width * 0.78))
            base_screen_h = int(round(base_screen_w * (852.0 / 393.0)))

    print(f"[{name}] Pre-building framed devices & callout cards ({width}x{height})...")

    dev_newtab_dark = build_framed_device(
        raw_screens["mobile_newtab_dark"], base_screen_w, base_screen_h, False, (99, 102, 241)
    )
    dev_newtab_light = build_framed_device(
        raw_screens["mobile_newtab_light"], base_screen_w, base_screen_h, False, (56, 189, 248)
    )
    dev_feed_timeline = build_framed_device(
        raw_screens["mobile_feed_timeline"], base_screen_w, base_screen_h, False, (16, 185, 129)
    )
    dev_feed_grid = build_framed_device(
        raw_screens["mobile_feed_grid"], base_screen_w, base_screen_h, False, (245, 158, 11)
    )
    dev_sources = build_framed_device(
        raw_screens["mobile_sources"], base_screen_w, base_screen_h, False, (236, 72, 153)
    )
    dev_profiles = build_framed_device(
        raw_screens["mobile_profiles"], base_screen_w, base_screen_h, False, (244, 63, 94)
    )
    dev_styles = build_framed_device(
        raw_screens["mobile_styles"], base_screen_w, base_screen_h, False, (56, 189, 248)
    )
    dev_tabs = build_framed_device(
        raw_screens["mobile_tabs"], base_screen_w, base_screen_h, False, (168, 85, 247)
    )

    callout_w = int(round(base_screen_w * 0.86))
    # 1. Pinned timelines & SNS services grid
    callout_services = build_zoom_callout_card(
        raw_screens["mobile_newtab_dark"],
        (0.04, 0.25, 0.96, 0.56),
        callout_w,
        (99, 102, 241),
        label="Pinned timelines & services",
    )
    # 2. Custom timeline header & source filter chips
    callout_feed_chips = build_zoom_callout_card(
        raw_screens["mobile_feed_timeline"],
        (0.03, 0.08, 0.97, 0.34),
        callout_w,
        (16, 185, 129),
        label="Source chips & timelines",
    )
    # 3. Manage sources search & site filters
    callout_sources_filter = build_zoom_callout_card(
        raw_screens["mobile_sources"],
        (0.02, 0.115, 0.98, 0.355),
        callout_w,
        (245, 158, 11),
        label="Filter sources & OPML",
    )
    # 4. Profiles & session isolation
    callout_profiles = build_zoom_callout_card(
        raw_screens["mobile_profiles"],
        (0.02, 0.14, 0.98, 0.44),
        callout_w,
        (244, 63, 94),
        label="Isolated cookie storage",
    )
    # 5. Custom CSS, scripts & blocklist
    callout_styles = build_zoom_callout_card(
        raw_screens["mobile_styles"],
        (0.02, 0.14, 0.98, 0.46),
        callout_w,
        (56, 189, 248),
        label="Custom CSS, JS & Blocklist",
    )

    pill_font_sz = max(16, int(round(base_screen_w * 0.044)))
    pill_design = build_floating_pill("• Design & Art · 3", (16, 185, 129), pill_font_sz, filled=True)
    pill_tech = build_floating_pill("• Tech & Web · 2", (99, 102, 241), pill_font_sz, filled=False)
    pill_visuals = build_floating_pill("• Visuals · 3", (245, 158, 11), pill_font_sz, filled=False)

    if is_landscape:
        stage_cx = width * 0.71
        stage_cy = height * 0.53
    else:
        stage_cx = width * 0.50
        stage_cy = height * 0.585

    ffmpeg_cmd = [
        shutil.which(os.environ.get("FFMPEG", "ffmpeg")) or "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-s",
        f"{width}x{height}",
        "-pix_fmt",
        "rgba",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-level",
        "4.0",
        "-r",
        str(FPS),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-shortest",
        "-movflags",
        "+faststart",
    ]

    if preview_dir is not None:
        preview_dir.mkdir(parents=True, exist_ok=True)
    frame_indices = ([0, 2 * FPS, 6 * FPS, 10 * FPS, 14 * FPS, 18 * FPS, TOTAL_FRAMES - 1]
                     if preview_dir is not None else range(TOTAL_FRAMES))
    with (nullcontext() if preview_dir is not None else video_encoder(ffmpeg_cmd, out_path)) as encoder_stdin:
        for frame_idx in frame_indices:
            t = frame_idx / float(FPS)  # 0.0 .. 20.0
            scene_idx = min(4, int(t // 4.0))
            scene_t = t - scene_idx * 4.0  # 0.0 .. 4.0 within current scene
            scene = SCENES[scene_idx]

            next_idx = min(4, scene_idx + 1)
            blend_bg = smoothstep(3.3, 4.0, scene_t)
            ac1 = lerp_color(scene["accent1"], SCENES[next_idx]["accent1"], blend_bg)
            ac2 = lerp_color(scene["accent2"], SCENES[next_idx]["accent2"], blend_bg)

            canvas = make_background(width, height, t, ac1, ac2)

            float_y = math.sin(t * 2.2) * (height * 0.006)
            float_rot = math.cos(t * 1.6) * 0.65

            # -------------------------------------------------------------------
            # SCENE 0 (0.0s - 4.0s): All-in-one SNS Browser & Pinned Timelines
            # -------------------------------------------------------------------
            if scene_idx == 0:
                enter = ease_out_back((scene_t + 0.85) / 0.85, overshoot=1.18)
                exit_p = smoothstep(3.45, 4.0, scene_t)

                sec_x = stage_cx + base_screen_w * lerp(0.45, 0.28, enter) + exit_p * 80
                sec_y = stage_cy + float_y * 0.7 + lerp(120, -10, enter)
                paste_transformed(
                    canvas,
                    dev_newtab_light,
                    (sec_x, sec_y),
                    scale=lerp(0.65, 0.84, enter) * (1.0 - exit_p * 0.15),
                    angle_deg=lerp(16.0, 8.5, enter) + float_rot * 0.5,
                    opacity=clamp(enter * (1.0 - exit_p)),
                )

                pri_x = stage_cx - base_screen_w * lerp(0.32, 0.14, enter) - exit_p * 60
                pri_y = stage_cy + float_y + lerp(140, 12, enter)
                paste_transformed(
                    canvas,
                    dev_newtab_dark,
                    (pri_x, pri_y),
                    scale=lerp(0.75, 0.94, enter) * (1.0 - exit_p * 0.12),
                    angle_deg=lerp(-12.0, -4.5, enter) + float_rot,
                    opacity=clamp(enter * (1.0 - exit_p)),
                )

                card_enter = ease_out_back((scene_t - 0.55) / 0.65, overshoot=1.25)
                if card_enter > 0.01:
                    card_x = stage_cx + base_screen_w * 0.08
                    card_y = stage_cy + base_screen_h * 0.25 + math.sin(t * 3.0) * 6
                    paste_transformed(
                        canvas,
                        callout_services,
                        (card_x, card_y),
                        scale=lerp(0.5, 1.0, card_enter) * (1.0 - exit_p * 0.25),
                        angle_deg=lerp(-6.0, -1.5, card_enter),
                        opacity=clamp(card_enter * (1.0 - exit_p)),
                    )

            # -------------------------------------------------------------------
            # SCENE 1 (4.0s - 8.0s): Feed Reader & Custom Timelines
            # -------------------------------------------------------------------
            elif scene_idx == 1:
                enter = ease_out_back(scene_t / 0.75, overshoot=1.15)
                exit_p = smoothstep(3.45, 4.0, scene_t)

                paste_transformed(
                    canvas,
                    dev_newtab_dark,
                    (stage_cx - base_screen_w * 0.26, stage_cy + 16),
                    scale=0.78,
                    angle_deg=-9.0,
                    opacity=0.38 * clamp(enter * (1.0 - exit_p)),
                )

                ed_x = stage_cx + base_screen_w * 0.04
                ed_y = stage_cy + float_y + lerp(130, 8, enter) - exit_p * 90
                paste_transformed(
                    canvas,
                    dev_feed_timeline,
                    (ed_x, ed_y),
                    scale=lerp(0.80, 0.96, enter),
                    angle_deg=lerp(8.0, 2.0, enter) + float_rot,
                    opacity=clamp(enter * (1.0 - exit_p)),
                )

                c_enter = ease_out_back((scene_t - 0.50) / 0.65, overshoot=1.2)
                if c_enter > 0.01:
                    paste_transformed(
                        canvas,
                        callout_feed_chips,
                        (stage_cx - base_screen_w * 0.08, stage_cy + base_screen_h * 0.20 + float_y * 1.2),
                        scale=lerp(0.6, 0.96, c_enter) * (1.0 - exit_p * 0.2),
                        angle_deg=-2.5,
                        opacity=clamp(c_enter * (1.0 - exit_p)),
                    )

                pills = [
                    (pill_design, -0.44, -0.26, 0.35, -7.0),
                    (pill_tech, 0.44, -0.18, 0.50, 6.5),
                    (pill_visuals, 0.42, 0.04, 0.65, -4.5),
                ]
                for pill_img, ox, oy, delay, rot in pills:
                    p_in = ease_out_back((scene_t - delay) / 0.55, overshoot=1.35)
                    if p_in > 0.01:
                        bob = math.sin(t * 3.4 + delay * 4.0) * 7.0
                        px = stage_cx + base_screen_w * ox
                        py = stage_cy + base_screen_h * oy + bob
                        paste_transformed(
                            canvas,
                            pill_img,
                            (px, py),
                            scale=lerp(0.4, 1.0, p_in) * (1.0 - exit_p * 0.3),
                            angle_deg=rot,
                            opacity=clamp(p_in * (1.0 - exit_p)),
                        )

            # -------------------------------------------------------------------
            # SCENE 2 (8.0s - 12.0s): Feed Media Gallery & Sources Management
            # -------------------------------------------------------------------
            elif scene_idx == 2:
                enter = ease_out_expo(scene_t / 0.70)
                exit_p = smoothstep(3.45, 4.0, scene_t)

                paste_transformed(
                    canvas,
                    dev_sources,
                    (stage_cx + base_screen_w * 0.30, stage_cy + 14),
                    scale=0.82,
                    angle_deg=9.5,
                    opacity=0.68 * clamp(enter * (1.0 - exit_p)),
                )

                dr_x = stage_cx - base_screen_w * 0.08
                dr_y = stage_cy + float_y + lerp(160, 6, enter)
                paste_transformed(
                    canvas,
                    dev_feed_grid,
                    (dr_x, dr_y),
                    scale=lerp(0.84, 0.96, enter) * (1.0 - exit_p * 0.12),
                    angle_deg=lerp(-7.0, -2.0, enter) + float_rot,
                    opacity=clamp(enter * (1.0 - exit_p)),
                )

                lens_in = ease_out_back((scene_t - 0.45) / 0.65, overshoot=1.22)
                if lens_in > 0.01:
                    lx = stage_cx + base_screen_w * 0.06
                    ly = stage_cy - base_screen_h * 0.18 + math.cos(t * 2.8) * 6
                    paste_transformed(
                        canvas,
                        callout_sources_filter,
                        (lx, ly),
                        scale=lerp(0.55, 1.02, lens_in) * (1.0 - exit_p * 0.2),
                        angle_deg=1.5,
                        opacity=clamp(lens_in * (1.0 - exit_p)),
                    )

            # -------------------------------------------------------------------
            # SCENE 3 (12.0s - 16.0s): Multi-Account Profiles & Sessions
            # -------------------------------------------------------------------
            elif scene_idx == 3:
                enter = ease_out_back(scene_t / 0.75, overshoot=1.15)
                exit_p = smoothstep(3.45, 4.0, scene_t)

                app_x = stage_cx - base_screen_w * lerp(0.42, 0.25, enter)
                app_y = stage_cy + float_y * 0.8 + 14
                paste_transformed(
                    canvas,
                    dev_profiles,
                    (app_x, app_y),
                    scale=lerp(0.70, 0.86, enter) * (1.0 - exit_p * 0.15),
                    angle_deg=-8.5 + float_rot * 0.5,
                    opacity=clamp(enter * 0.92 * (1.0 - exit_p)),
                )

                w1 = smoothstep(0.65, 1.45, scene_t)
                w2 = smoothstep(1.85, 2.65, scene_t)
                morphed = blend_diagonal_wipe(dev_newtab_dark, dev_tabs, w1, (244, 63, 94))
                morphed = blend_diagonal_wipe(morphed, dev_newtab_light, w2, (168, 85, 247))

                morph_x = stage_cx + base_screen_w * lerp(0.32, 0.16, enter)
                morph_y = stage_cy + float_y + 4
                paste_transformed(
                    canvas,
                    morphed,
                    (morph_x, morph_y),
                    scale=lerp(0.78, 0.94, enter) * (1.0 - exit_p * 0.12),
                    angle_deg=4.5 + float_rot,
                    opacity=clamp(enter * (1.0 - exit_p)),
                )

                sw_in = ease_out_back((scene_t - 0.50) / 0.65, overshoot=1.22)
                if sw_in > 0.01:
                    paste_transformed(
                        canvas,
                        callout_profiles,
                        (stage_cx - base_screen_w * 0.04, stage_cy + base_screen_h * 0.25 + float_y),
                        scale=lerp(0.55, 0.98, sw_in) * (1.0 - exit_p * 0.2),
                        angle_deg=-1.8,
                        opacity=clamp(sw_in * (1.0 - exit_p)),
                    )

            # -------------------------------------------------------------------
            # SCENE 4 (16.0s - 20.0s): Blocklist, Custom CSS/Scripts & Finale
            # -------------------------------------------------------------------
            else:
                enter = ease_out_back(scene_t / 0.75, overshoot=1.16)
                finale_morph = smoothstep(1.85, 2.65, scene_t)

                left_wing_x = stage_cx - base_screen_w * lerp(0.12, 0.34, finale_morph)
                left_wing_y = stage_cy + 22 + float_y * 0.7
                paste_transformed(
                    canvas,
                    dev_tabs,
                    (left_wing_x, left_wing_y),
                    scale=lerp(0.70, 0.80, finale_morph),
                    angle_deg=lerp(-4.0, -12.5, finale_morph),
                    opacity=clamp(enter * lerp(0.35, 0.90, finale_morph)),
                )

                right_wing_x = stage_cx + base_screen_w * lerp(0.12, 0.34, finale_morph)
                right_wing_y = stage_cy + 22 + float_y * 0.7
                paste_transformed(
                    canvas,
                    dev_feed_timeline,
                    (right_wing_x, right_wing_y),
                    scale=lerp(0.70, 0.80, finale_morph),
                    angle_deg=lerp(4.0, 12.5, finale_morph),
                    opacity=clamp(enter * lerp(0.35, 0.90, finale_morph)),
                )

                center_dev = blend_diagonal_wipe(
                    dev_styles, dev_newtab_dark, finale_morph, (99, 102, 241)
                )
                paste_transformed(
                    canvas,
                    center_dev,
                    (stage_cx - base_screen_w * lerp(0.04, 0.0, finale_morph), stage_cy + float_y),
                    scale=lerp(0.82, 0.95, enter),
                    angle_deg=lerp(2.5, 0.0, finale_morph) + float_rot * 0.5,
                    opacity=clamp(enter),
                )

                tb_in = ease_out_back((scene_t - 0.35) / 0.55, overshoot=1.25)
                tb_out = 1.0 - smoothstep(1.95, 2.55, scene_t)
                if tb_in * tb_out > 0.01:
                    tb_x = stage_cx + base_screen_w * lerp(0.14, 0.04, tb_in)
                    tb_y = stage_cy + base_screen_h * lerp(0.32, 0.28, tb_in) + float_y * 1.15
                    paste_transformed(
                        canvas,
                        callout_styles,
                        (tb_x, tb_y),
                        scale=lerp(0.70, 1.02, tb_in) * (0.85 + 0.15 * tb_out),
                        angle_deg=lerp(-9.5, -3.0, tb_in),
                        opacity=clamp(tb_in * tb_out),
                    )

            draw_scene_copy(canvas, scene, scene_t, scene_idx, is_landscape, icon_img)

            if preview_dir is not None:
                canvas.convert("RGB").save(preview_dir / f"{out_path.stem}-{frame_idx:03d}.jpg", quality=90)
            else:
                encoder_stdin.write(canvas.tobytes())
                if (frame_idx + 1) % (FPS * 4) == 0:
                    print(f"[{name}] {frame_idx + 1}/{TOTAL_FRAMES} frames", flush=True)

    if preview_dir is not None:
        print(f"✓ Preview frames: {preview_dir / out_path.stem}-*.jpg")
        return
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"✓ Rendered {name} -> {out_path.relative_to(ROOT_DIR)} ({size_mb:.2f} MB)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", action="append", choices=("landscape", "portrait"),
                        help="Render only this target (repeat to select several); default: all.")
    parser.add_argument("--preview-dir", type=Path, help="Save representative still frames here instead of encoding videos.")
    args = parser.parse_args()
    if args.preview_dir is None and shutil.which(os.environ.get("FFMPEG", "ffmpeg")) is None:
        print("FFmpeg not found. Install it on PATH or set FFMPEG to its executable.", file=sys.stderr)
        return 1

    required_files = {
        "mobile_newtab_dark": ASSETS_DIR / "mobile_01_newtab_services.png",
        "mobile_newtab_light": ASSETS_DIR / "mobile_02_newtab_light.png",
        "mobile_feed_timeline": ASSETS_DIR / "mobile_03_feed_timeline.png",
        "mobile_feed_grid": ASSETS_DIR / "mobile_04_feed_gallery_grid.png",
        "mobile_sources": ASSETS_DIR / "mobile_05_manage_sources.png",
        "mobile_profiles": ASSETS_DIR / "mobile_06_profiles_sessions.png",
        "mobile_styles": ASSETS_DIR / "mobile_07_styles_blocklist.png",
        "mobile_tabs": ASSETS_DIR / "mobile_08_tabs_switcher.png",
    }

    missing = [str(p) for p in required_files.values() if not p.exists()]
    if missing:
        print("Missing UI capture assets:", missing, file=sys.stderr)
        return 1

    raw_screens = {k: Image.open(p).convert("RGBA") for k, p in required_files.items()}
    icon_img = Image.open(ICON_PATH).convert("RGBA")

    targets = {
        "landscape": (1920, 1080, "promo-landscape-1920x1080.mp4"),
        "portrait": (1080, 1920, "promo-portrait-1080x1920.mp4"),
    }
    for key in dict.fromkeys(args.target or targets):
        width, height, filename = targets[key]
        render_video_target(
            f"Google Play Promo — {key}", width, height, "phone",
            OUT_ROOT / "android" / "en-US" / filename,
            raw_screens, icon_img, args.preview_dir,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
