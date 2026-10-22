#!/usr/bin/env python3
"""Render 20-second Google Play promos from real, seeded app interactions.

The committed simulator recordings make rendering independent of a running app.
See fastlane/videos/README.md for capture and render instructions.
"""

import argparse
from contextlib import ExitStack, contextmanager, nullcontext
from functools import lru_cache
import math
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import List, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT_DIR / "fastlane" / "videos"
RECORDINGS_DIR = OUT_ROOT / "recordings" / "promo"
ICON_PATH = ROOT_DIR / "assets" / "images" / "icon.png"
FPS = 30
DURATION_SEC = 20
TOTAL_FRAMES = FPS * DURATION_SEC
TRANSITION_SEC = 0.35

# A benefit and one interaction per shot. The closing card holds for three seconds.
SCENES = [
    dict(start=0, end=3, clip="home", title="Your socials.\nOne browser.",
         subtitle="Bluesky, Instagram, Reddit & more.", accent=(99, 102, 241)),
    dict(start=3, end=9, clip="timeline", title="Follow what\nyou choose.",
         subtitle="Your sources. Your timelines.", accent=(16, 185, 129)),
    dict(start=9, end=14, clip="profiles", title="Work and personal.\nKept separate.",
         subtitle="Switch profiles. Keep separate sessions.", accent=(244, 63, 94)),
    dict(start=14, end=17, clip="gallery", title="Browse\nyour way.",
         subtitle="From timelines to media grids.", accent=(245, 158, 11)),
    dict(start=17, end=20, clip=None, title="Your socials.\nYour space.",
         subtitle="Try Nora today.", accent=(99, 102, 241)),
]


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)


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



class VideoFrames:
    """Stream only the requested frames; do not retain decoded videos in memory."""

    def __init__(self, path: Path, width: int, height: int, full_screen: bool = False):
        self.path = path
        self.size = (width, height)
        # Crop away simulator status/home bars, then fill the app window without
        # distorting the UI. The lower part is intentionally outside the viewport.
        filters = (f"crop=iw:trunc(ih*0.91/2)*2:0:trunc(ih*0.05/2)*2,"
                   f"scale={width}:{height}:force_original_aspect_ratio=increase,"
                   f"crop={width}:{height}:0:0,setsar=1,fps={FPS},"
                   "tpad=stop_mode=clone:stop_duration=2")
        if full_screen:
            filters = (f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                       f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={FPS},"
                       "tpad=stop_mode=clone:stop_duration=20")
        self.diagnostics = tempfile.TemporaryFile()
        self.proc = subprocess.Popen(
            [os.environ.get("FFMPEG", "ffmpeg"), "-v", "error", "-i", str(path),
             "-an", "-vf", filters, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            stdout=subprocess.PIPE, stderr=self.diagnostics,
        )
        self.index = -1
        self.frame = None

    def at(self, time: float) -> Image.Image:
        target = max(0, int(round(time * FPS)))
        if target < self.index:
            raise ValueError("Video frames must be requested in chronological order")
        frame_bytes = self.size[0] * self.size[1] * 3
        while self.index < target:
            data = self.proc.stdout.read(frame_bytes)
            if len(data) != frame_bytes:
                self.diagnostics.seek(0)
                details = self.diagnostics.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"Cannot decode {self.path.name} at {time:.2f}s: {details}")
            self.frame = Image.frombytes("RGB", self.size, data).convert("RGBA")
            self.index += 1
        return self.frame

    def close(self):
        self.proc.stdout.close()
        if self.proc.poll() is None:
            self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
        self.diagnostics.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def rounded_mask(size, radius):
    mask = Image.new("L", size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0]-1, size[1]-1), radius, fill=255)
    return mask


def text_block(draw, xy, text, font, fill, spacing=12, anchor="la"):
    # Use visible glyph bounds, so placement does not depend on font ascenders.
    box = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing)
    x, y = xy
    if anchor == "ma":
        x -= (box[2] - box[0]) / 2
    draw.multiline_text((x-box[0], y-box[1]), text, font=font, fill=fill,
                        spacing=spacing, align="center" if anchor == "ma" else "left")
    return box[3] - box[1]


def fit_font(draw, text, size, max_width, bold=False):
    while size > 12:
        font = load_font(size, bold)
        bounds = draw.multiline_textbbox((0, 0), text, font=font, spacing=12)
        if bounds[2] - bounds[0] <= max_width:
            return font
        size -= 1
    return load_font(size, bold)


def shot_layout(width, height):
    if width > height:
        return (int(width*.53), int(height*.12), int(width*.40), int(height*.77))
    return (int(width*.08), int(height*.27), int(width*.84), int(height*.63))


def render_shot(scene, frame, width, height, icon, background):
    canvas = background.copy()
    draw = ImageDraw.Draw(canvas)
    landscape = width > height
    unit = min(width, height)
    left = int(width*.065) if landscape else int(width*.08)
    top = int(height*.19) if landscape else int(height*.055)
    brand_size = int(unit*.042)
    brand_icon = icon.resize((brand_size, brand_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(brand_icon, (left, top))
    draw.text((left+brand_size+int(unit*.014), top+int(unit*.005)), "Nora",
              font=load_font(int(unit*.031), True), fill="white")

    title_y = top + brand_size + int(unit*.046)
    max_width = int(width*.43) if landscape else int(width*.84)
    title_size = int(unit*(.080 if landscape else .072))
    font = fit_font(draw, scene["title"], title_size, max_width, True)
    title_h = text_block(draw, (left, title_y), scene["title"], font, "white")
    sub_y = title_y + title_h + int(unit*.030)
    sub_font = fit_font(draw, scene["subtitle"], int(unit*.030), max_width)
    text_block(draw, (left, sub_y), scene["subtitle"], sub_font, (190, 203, 220))

    # One upright app window. No floating overlays covering the interaction.
    x, y, w, h = shot_layout(width, height)
    radius = int(unit*.028)
    draw.rounded_rectangle((x-3, y-3, x+w+3, y+h+3), radius+3, fill=(80, 94, 122))
    canvas.paste(frame, (x, y), rounded_mask((w, h), radius))

    # A small editorial marker leaves a quiet margin below the app window.
    footer_y = int(height*.92)
    if landscape:
        footer_x = left
        footer_y = int(height*.81)
    else:
        footer_x = x
    draw.text((footer_x, footer_y), "SOCIAL BROWSING, YOUR WAY",
              font=load_font(int(unit*.019), True), fill=(155, 173, 198))
    return canvas


def render_closing(width, height, icon, background):
    canvas = background.copy()
    draw = ImageDraw.Draw(canvas)
    unit = min(width, height)
    center = width // 2
    landscape = width > height
    top = int(height*(.15 if landscape else .24))
    icon_size = int(unit*.14)
    canvas.alpha_composite(icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS),
                           (center-icon_size//2, top))
    y = top + icon_size + int(unit*.028)
    y += text_block(draw, (center, y), "Nora", load_font(int(unit*.085), True), "white", anchor="ma")
    y += int(unit*.035)
    tagline = "Your socials. Your space." if landscape else "Your socials.\nYour space."
    y += text_block(draw, (center, y), tagline, load_font(int(unit*.052), True), "white", anchor="ma")
    y += int(unit*.050)
    label = "Try Nora today"
    font = load_font(int(unit*.030), True)
    box = draw.textbbox((0, 0), label, font=font)
    button_w = box[2]-box[0]+int(unit*.09)
    button_h = int(unit*.085)
    draw.rounded_rectangle((center-button_w//2, y, center+button_w//2, y+button_h),
                           radius=button_h//2, fill=(106, 110, 245))
    text_block(draw, (center, y+(button_h-(box[3]-box[1]))//2), label, font, "white", anchor="ma")
    y += button_h + int(unit*.030)
    text_block(draw, (center, y), "Get it on Google Play", load_font(int(unit*.024)),
               (190, 203, 220), anchor="ma")
    return canvas


def scene_at(t):
    return next((i for i, s in enumerate(SCENES) if t < s["end"]), len(SCENES)-1)


def render_video_target(name, width, height, out_path, icon, preview_dir=None):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    _, _, app_w, app_h = shot_layout(width, height)
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
               "-f", "rawvideo", "-vcodec", "rawvideo", "-s", f"{width}x{height}",
               "-pix_fmt", "rgba", "-r", str(FPS), "-i", "-",
               "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
               "-c:v", "libx264", "-preset", "medium", "-crf", "18",
               "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0",
               "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
               "-shortest", "-movflags", "+faststart"]
    if preview_dir:
        preview_dir.mkdir(parents=True, exist_ok=True)
        # Include every transition midpoint, opening, and closing hold.
        indices = sorted({0, 45, 150, 330, 450, 540, TOTAL_FRAMES-1,
                          *(int((s["start"]+TRANSITION_SEC/2)*FPS) for s in SCENES[1:])})
    else:
        indices = range(TOTAL_FRAMES)

    with ExitStack() as stack:
        streams = {s["clip"]: stack.enter_context(VideoFrames(
            RECORDINGS_DIR / f"{s['clip']}.mp4", app_w, app_h))
            for s in SCENES if s["clip"]}
        pipe = stack.enter_context(nullcontext() if preview_dir else video_encoder(command, out_path))

        def shot(index, t):
            scene = SCENES[index]
            bg = make_background(width, height, t*.3, scene["accent"], (56, 189, 248))
            if scene["clip"] is None:
                return render_closing(width, height, icon, bg)
            frame = streams[scene["clip"]].at(t-scene["start"])
            return render_shot(scene, frame, width, height, icon, bg)

        for n in indices:
            t = n / FPS
            index = scene_at(t)
            canvas = shot(index, t)
            elapsed = t - SCENES[index]["start"]
            if index and elapsed < TRANSITION_SEC:
                # Keep outgoing content visible while the next shot enters.
                previous = shot(index-1, t)
                canvas = Image.blend(previous, canvas, smoothstep(0, TRANSITION_SEC, elapsed))
            if preview_dir:
                canvas.convert("RGB").save(preview_dir / f"{out_path.stem}-{n:03d}.jpg", quality=92)
            else:
                pipe.write(canvas.tobytes())
                if (n+1) % (FPS*4) == 0:
                    print(f"[{name}] {n+1}/{TOTAL_FRAMES} frames", flush=True)
    print(f"✓ {name}: {preview_dir or out_path}", flush=True)



def import_recordings(directory, output_dir=RECORDINGS_DIR, width=946):
    """Fit raw capture timing to each shot, keeping a handle for the dissolve."""
    output_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
    ffprobe = os.environ.get("FFPROBE", "ffprobe")
    for scene in SCENES:
        if not scene["clip"]:
            continue
        source = directory / f"{scene['clip']}.mp4"
        duration = float(subprocess.check_output(
            [ffprobe, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(source)], text=True).strip())
        target_duration = scene["end"] - scene["start"] + TRANSITION_SEC + 0.1
        if duration <= 0:
            raise ValueError(f"Empty recording: {source}")
        # Maestro may wait several seconds before delivering a tap. Remove that
        # frozen lead-in, retaining 0.4s of context before the first action.
        trim = 0.0
        if scene["clip"] != "home":
            analysis = subprocess.run(
                [ffmpeg, "-hide_banner", "-i", str(source), "-vf",
                 "crop=iw:ih*0.85:0:ih*0.08,freezedetect=n=-60dB:d=0.3",
                 "-an", "-f", "null", "-"], capture_output=True, text=True, check=True)
            first_freeze = re.search(r"freeze_start: ([\d.]+)", analysis.stderr)
            first_action = re.search(r"freeze_end: ([\d.]+)", analysis.stderr)
            if first_freeze and float(first_freeze[1]) < 0.1 and first_action:
                trim = max(0, float(first_action[1]) - 0.4)
        # Cap slow motion and hold the completed action when a capture is short.
        timing = min(1.25, target_duration / (duration-trim))
        filters = (f"setpts={timing:.9f}*(PTS-STARTPTS),"
                   f"fps={FPS},scale={width}:-2,setsar=1,"
                   f"tpad=stop_mode=clone:stop_duration={target_duration}")
        with tempfile.TemporaryDirectory(prefix=".capture-", dir=output_dir) as work:
            staged = Path(work) / source.name
            subprocess.run([ffmpeg, "-v", "error", "-y", "-ss", str(trim), "-i", str(source),
                            "-an", "-vf", filters, "-t", str(target_duration),
                            "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
                            "-movflags", "+faststart", str(staged)], check=True)
            staged.replace(output_dir / source.name)
        print(f"Imported {source.name}: trimmed {trim:.2f}s; {target_duration:.2f}s shot", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", action="append", choices=("landscape", "portrait"))
    parser.add_argument("--preview-dir", type=Path, help="Render storyboard and transition stills only.")
    parser.add_argument("--import-recordings", type=Path, metavar="DIR",
                        help="Normalize four raw Maestro clips before rendering (requires ffprobe).")
    args = parser.parse_args()
    if shutil.which(os.environ.get("FFMPEG", "ffmpeg")) is None:
        parser.error("Install ffmpeg on PATH or set FFMPEG to its executable.")
    if args.import_recordings:
        import_recordings(args.import_recordings)
    missing = [str(RECORDINGS_DIR / f"{s['clip']}.mp4") for s in SCENES
               if s["clip"] and not (RECORDINGS_DIR / f"{s['clip']}.mp4").exists()]
    if missing:
        parser.error("Missing app recordings: " + ", ".join(missing))
    icon = Image.open(ICON_PATH).convert("RGBA")
    targets = {"landscape": (1920, 1080), "portrait": (1080, 1920)}
    for name in dict.fromkeys(args.target or targets):
        width, height = targets[name]
        render_video_target(name, width, height,
                            OUT_ROOT / "android" / "en-US" / f"promo-{name}-{width}x{height}.mp4",
                            icon, args.preview_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
